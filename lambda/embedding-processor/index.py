import urllib.parse

def handler(event, context):   
    for record in event['Records']:
    # Check if this is an ObjectCreated event
        if record['eventName'].startswith('ObjectCreated'):
            bucket = record['s3']['bucket']['name']
            key = urllib.parse.unquote_plus(record['s3']['object']['key'])
            
            try:
                # Handle the created object
                print(f"Processing new object: {key} in bucket: {bucket}")
                # Add your processing logic here
                
            except Exception as e:
                print(f"Error processing {key}: {e}")
                raise e