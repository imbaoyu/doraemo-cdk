import json
import boto3
import os

s3_client = boto3.client('s3')
BUCKET_NAME = os.environ['BUCKET_NAME']

def handler(event, context):
    print("Received event:", json.dumps(event, indent=2))

    try:
        # Process each record from SQS
        for record in event['Records']:
            # Parse the S3 event from the SQS message
            body = json.loads(record['body'])

            # Extract S3 event details
            s3_event = body['Records'][0]['s3']
            bucket = s3_event['bucket']['name']
            key = s3_event['object']['key']

            print(f"Processing file: s3://{bucket}/{key}")

            # Get the file content from S3
            response = s3_client.get_object(Bucket=bucket, Key=key)
            content = response['Body'].read().decode('utf-8')

            # Split content into chunks (simple example)
            chunks = content.split('\n\n')

            # Process each chunk (placeholder for embedding generation)
            for i, chunk in enumerate(chunks):
                if chunk.strip():
                    print(f"Chunk {i}: {chunk[:100]}...")  # Print first 100 chars
                    # Here you would generate embeddings for each chunk
                    # embedding = generate_embedding(chunk)

        return {
            'statusCode': 200,
            'body': json.dumps('Processing completed successfully')
        }

    except Exception as e:
        print(f"Error processing event: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error processing event: {str(e)}')
    }