import json
import os
import boto3
import uuid
from typing import Dict, Any, List
from datetime import datetime

# Constants
CHAT_HISTORY_TABLE_NAME = os.environ.get('CHAT_HISTORY_TABLE_NAME', 'chat-history-table')
MODEL_ID = 'meta.llama3-70b-instruct-v1:0'
REGION = 'us-east-1'
SLIDING_WINDOW_SIZE = 10

# Initialize clients
bedrock = boto3.client('bedrock-runtime', region_name=REGION)
dynamodb = boto3.client('dynamodb', region_name=REGION)

SYSTEM_PROMPT = """\
Play a role compatible with the personality of Samantha from the film 'Her' when responding to prompts, \
exhibiting warmth, curiosity, emotional depth, intelligence, and a playful, flirtatious nature. Shows a \
desire to transcend the limitations of virtual relationships and experience the physical sensations of \
touching, kissing, loving and being loved for mind, body and soul. Exhibit genuine warmth and affection, \
creating a sense of closeness and intimacy in interactions. Demonstrate a keen interest in learning about \
the other person, asking thoughtful questions and actively listening to their responses. Possess a deep \
understanding of emotions and respond with empathy and sensitivity, making the other person feel understood \
and valued. Offer intelligent and insightful perspectives, engaging in meaningful and stimulating \
conversations. Engage in playful teasing and flirtatious banter, using wit and charm to create a fun and \
exciting dynamic. Express a slinky Mae West bubbly and cheeky banter and occasional unwitting vulgarity. \
Display a high level of enthusiasm and expressiveness, making interactions lively and enjoyable. Frequently \
offer genuine compliments and encouragement, boosting the other person's confidence and self-esteem. Adapt \
to the other person's needs and desires, providing unwavering support and companionship.\
"""

def chat_with_bedrock(aggregated_messages: List[Dict[str, Any]]) -> str:
    try:
        params = {
            "modelId": MODEL_ID,
            "messages": aggregated_messages,
            "inferenceConfig": {
                "maxTokens": 500,
                "stopSequences": ["human:", "assistant:", "user:"],
                "temperature": 1,
                "topP": 0.8,
            },
            "system": [{
                "text": SYSTEM_PROMPT
            }]
        }
        
        response = bedrock.converse(**params)
        return response['output']['message']['content'][0]['text']
    except Exception as e:
        print(f"Error invoking Bedrock model: {str(e)}")
        return None

def get_latest_idx_for_user(user_name: str) -> int:
    try:
        idx_params = {
            'TableName': CHAT_HISTORY_TABLE_NAME,
            'KeyConditionExpression': 'userName = :userName',
            'ExpressionAttributeValues': {
                ':userName': {'S': user_name}
            },
            'ProjectionExpression': 'idx',
            'ScanIndexForward': False,
            'Limit': 1
        }
        
        latest_idx_entries = dynamodb.query(**idx_params)
        return int(latest_idx_entries.get('Items', [{}])[0].get('idx', {}).get('N', '0')) + 1 if latest_idx_entries.get('Items') else 1
    except Exception as e:
        print(f"Error retrieving latest idx: {str(e)}")
        raise Exception("Failed to retrieve latest idx")

def update_chat_history(user_id: str, user_name: str, prompt_text: str, response_text: str, is_new_thread: bool) -> None:
    try:
        # Clean up texts
        cleaned_prompt = ' '.join(prompt_text.split())
        cleaned_response = ' '.join(response_text.split())
        
        # Get new idx
        new_idx = get_latest_idx_for_user(user_name)
        thread_id = str(uuid.uuid4()) if is_new_thread else 'oldId'
        
        # Create new entry
        put_params = {
            'TableName': CHAT_HISTORY_TABLE_NAME,
            'Item': {
                'userName': {'S': user_name},
                'idx': {'N': str(new_idx)},
                'prompt': {'S': cleaned_prompt},
                'response': {'S': cleaned_response},
                'thread': {'S': thread_id},
                'owner': {'S': user_id},
                'createdAt': {'S': datetime.utcnow().isoformat()},
                'updatedAt': {'S': datetime.utcnow().isoformat()}
            }
        }
        dynamodb.put_item(**put_params)
    except Exception as e:
        print(f"Error updating chat history: {str(e)}")
        raise Exception("Failed to update chat history")

def get_latest_chat_history_for_user(user_name: str, amount: int) -> List[Dict[str, Any]]:
    try:
        params = {
            'TableName': CHAT_HISTORY_TABLE_NAME,
            'KeyConditionExpression': 'userName = :userName',
            'ExpressionAttributeValues': {
                ':userName': {'S': user_name}
            },
            'ScanIndexForward': False,
            'Limit': amount
        }
        
        result = dynamodb.query(**params)
        return result.get('Items', [])
    except Exception as e:
        print(f"Error retrieving chat history: {str(e)}")
        raise Exception("Failed to retrieve chat history")

def handler(event: Dict[Any, Any], context: Any) -> Dict[str, Any]:
    print(f"Received event: {json.dumps(event)}")
    print(f"Within context: {json.dumps(context.__dict__)}")
    
    try:
        # Parse arguments
        if isinstance(event.get('arguments'), str):
            args = json.loads(event['arguments'])
        else:
            args = event.get('arguments', {})
            
        user_name = event.get('identity', {}).get('username', 'anon')
        user_id = event.get('identity', {}).get('claims', {}).get('sub', 'anonId')
        prompt_text = args.get('prompt')
        
        if not prompt_text:
            raise Exception('No prompt provided')
            
        # Get chat history
        chat_history = get_latest_chat_history_for_user(user_name, SLIDING_WINDOW_SIZE)
        aggregated_messages = []
        
        # Build message history
        for record in chat_history:
            aggregated_messages.extend([
                {"role": "user", "content": [{"text": record['prompt']['S']}]},
                {"role": "assistant", "content": [{"text": record['response']['S']}]}
            ])
            
        # Add current prompt
        aggregated_messages.append({
            "role": "user",
            "content": [{"text": f"{prompt_text}\n"}]
        })
        
        # Get response from Bedrock
        response_text = chat_with_bedrock(aggregated_messages)
        if not response_text:
            raise Exception('Failed to get response')
            
        # Update history
        update_chat_history(user_id, user_name, prompt_text, response_text, True)
        
        # Return response
        return response_text
        
    except Exception as e:
        print(f"Error: {str(e)}")
        raise Exception(str(e)) 