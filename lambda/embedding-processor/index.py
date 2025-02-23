import urllib.parse
import boto3
import io
import lancedb
from PyPDF2 import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import LanceDB

from typing import List

s3_client = boto3.client('s3')
bedrock_client = boto3.client('bedrock-runtime', region_name='us-east-1')
embeddings = BedrockEmbeddings(
    client=bedrock_client,
    model_id="amazon.titan-embed-text-v2:0"
)

def get_user_id_from_key(key: str) -> str:
    # Assuming path format: user-documents/{userId}/filename
    parts = key.split('/')
    if len(parts) >= 2:
        return parts[1]
    raise ValueError(f"Invalid document key format: {key}")

def is_pdf(filename):
    return filename.lower().endswith('.pdf')

def extract_text_from_pdf(pdf_reader: PdfReader) -> str:
    text = ""
    for page in pdf_reader.pages:
        text += page.extract_text()
    return text

def create_chunks(text: str) -> List[str]:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
        separators=["\n\n", "\n", " ", ""]
    )
    return text_splitter.split_text(text)

def store_document_embeddings(bucket: str, document_key: str, chunks: List[str]) -> None:
    # Get user ID from the document key
    user_id = get_user_id_from_key(document_key)
    
    # Connect to LanceDB using the lancedb library directly
    db = lancedb.connect(f"s3://{bucket}/user-documents/{user_id}/embeddings")
    
    # Use a fixed table name for all documents of this user
    table_name = "document_embeddings"
    
    # Create metadata for each chunk
    metadatas = [{"source": document_key, "chunk_index": i} for i in range(len(chunks))]
    
    # Get or create the table
    try:
        # Try to get existing table
        table = db.open_table(table_name)
        vectorstore = LanceDB(
            connection=table,  # Pass the table instead of connection
            embedding=embeddings,
        )
        # Add to existing table
        vectorstore.add_texts(texts=chunks, metadatas=metadatas)
    except:
        # If table doesn't exist, create new one
        vectorstore = LanceDB.from_texts(
            texts=chunks,
            embedding=embeddings,
            connection=db,  # Pass the db connection for new table creation
            table_name=table_name,
            metadatas=metadatas
        )
    
    print(f"Stored {len(chunks)} embeddings for user {user_id} in table: {table_name}")
    return vectorstore

def handler(event, context):   
    for record in event['Records']:
        # Get the SQS message which contains the S3 event
        if 'body' in record:
            import json
            s3_event = json.loads(record['body'])
            records = s3_event.get('Records', [])
        else:
            records = [record]

        for s3_record in records:
            # Check if this is an ObjectCreated event
            if 's3' in s3_record and s3_record.get('eventName', '').startswith('ObjectCreated'):
                bucket = s3_record['s3']['bucket']['name']
                key = urllib.parse.unquote_plus(s3_record['s3']['object']['key'])
                
                try:
                    # Check if file exists in S3 before processing
                    try:
                        s3_client.head_object(Bucket=bucket, Key=key)
                    except s3_client.exceptions.ClientError as e:
                        if e.response['Error']['Code'] == '404':
                            print(f"File {key} no longer exists in S3, skipping processing")
                            # Return successfully to delete message from SQS
                            return {
                                'statusCode': 200,
                                'body': 'File no longer exists, message deleted from queue'
                            }
                        else:
                            raise e

                    if not is_pdf(key):
                        raise Exception(f"File {key} is not a PDF file")

                    # Download the file to memory
                    print(f"Downloading file: {key} from bucket: {bucket}")
                    response = s3_client.get_object(Bucket=bucket, Key=key)
                    file_content = response['Body'].read()

                    # Read PDF content
                    pdf_file = io.BytesIO(file_content)
                    pdf_reader = PdfReader(pdf_file)
                    
                    if len(pdf_reader.pages) > 0:
                        # Extract text from all pages
                        text = extract_text_from_pdf(pdf_reader)
                        
                        # Split text into chunks
                        chunks = create_chunks(text)
                        print(f"Created {len(chunks)} chunks from PDF {key}")
                        
                        if chunks:
                            # Store document chunks with embeddings
                            vectorstore = store_document_embeddings(bucket, key, chunks)
                            
                            # Demonstrate retrieval with the first chunk
                            # similar_chunks = vectorstore.similarity_search(
                            #     chunks[0], 
                            #     k=1
                            # )
                            # print(f"First chunk content: {chunks[0]}")
                            # print(f"Retrieved similar chunk: {similar_chunks[0].page_content}")
                        else:
                            print("No chunks were created (empty document)")
                    else:
                        print(f"PDF {key} has no pages")
                    
                except Exception as e:
                    print(f"Error processing {key}: {e}")
                    raise e