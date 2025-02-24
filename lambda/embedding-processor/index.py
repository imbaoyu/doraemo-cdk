import urllib.parse
import boto3
import io
import json
import lancedb
from PyPDF2 import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import BedrockEmbeddings
from langchain_community.vectorstores import LanceDB

from typing import List
import os

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
    print(f"Received event: {json.dumps(event)}")
    
    for record in event['Records']:
        # Parse the SQS message which contains the SNS message
        try:
            # Extract the SNS message from the SQS body
            sqs_body = json.loads(record['body'])
            sns_message = json.loads(sqs_body['Message'])
            print(f"SNS message: {json.dumps(sns_message)}")
            
            # Only process DOCUMENT_UPLOADED events
            if sns_message.get('eventType') != 'DOCUMENT_UPLOADED':
                print(f"Skipping non-upload event: {sns_message.get('eventType')}")
                continue
                
            document_path = sns_message.get('documentPath')
            if not document_path:
                print("No document path in message")
                continue
                
            # Extract bucket name from the environment
            bucket = os.environ.get('BUCKET_NAME')
            if not bucket:
                raise ValueError("BUCKET_NAME environment variable not set")
                
            try:
                # Check if file exists in S3 before processing
                try:
                    s3_client.head_object(Bucket=bucket, Key=document_path)
                except s3_client.exceptions.ClientError as e:
                    if e.response['Error']['Code'] == '404':
                        print(f"File {document_path} no longer exists in S3, skipping processing")
                        continue  # Skip this message and move to next one
                    else:
                        raise e

                if not is_pdf(document_path):
                    print(f"File {document_path} is not a PDF file, skipping")
                    continue

                # Download the file to memory
                print(f"Downloading file: {document_path} from bucket: {bucket}")
                response = s3_client.get_object(Bucket=bucket, Key=document_path)
                file_content = response['Body'].read()

                # Read PDF content
                pdf_file = io.BytesIO(file_content)
                pdf_reader = PdfReader(pdf_file)
                
                if len(pdf_reader.pages) > 0:
                    # Extract text from all pages
                    text = extract_text_from_pdf(pdf_reader)
                    
                    # Split text into chunks
                    chunks = create_chunks(text)
                    print(f"Created {len(chunks)} chunks from PDF {document_path}")
                    
                    if chunks:
                        # Store document chunks with embeddings
                        vectorstore = store_document_embeddings(bucket, document_path, chunks)
                    else:
                        print("No chunks were created (empty document)")
                else:
                    print(f"PDF {document_path} has no pages")
                
            except Exception as e:
                print(f"Error processing {document_path}: {e}")
                # Let the message go to DLQ after max retries
                raise e
                
        except json.JSONDecodeError as e:
            print(f"Error parsing message: {e}")
            continue  # Skip malformed messages
        except Exception as e:
            print(f"Error processing record: {e}")
            raise e  # Let the message go to DLQ after max retries