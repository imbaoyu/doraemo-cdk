import urllib.parse
import boto3
from PyPDF2 import PdfReader
import os
import io

s3_client = boto3.client('s3')

def is_pdf(filename):
    return filename.lower().endswith('.pdf')

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
                        # Extract text from the first page
                        first_page = pdf_reader.pages[0]
                        text = first_page.extract_text()
                        first_line = text.split('\n')[0] if text else "No text found"
                        print(f"First line of PDF {key}: {first_line}")
                    else:
                        print(f"PDF {key} has no pages")
                    
                except Exception as e:
                    print(f"Error processing {key}: {e}")
                    raise e