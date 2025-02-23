import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EmbeddingConstruct } from './embedding-construct';
import { ChatConstruct } from './chat-construct';

export class DoraemoCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing bucket
    const bucket = s3.Bucket.fromBucketName(this, 
        'UserDocumentBucket', 
        'amplify-d1r842ef96fa1l-ma-doraemowebamplifystorage-0jemj9g9wtye');

    // Initialize the embedding construct
    new EmbeddingConstruct(this, 'EmbeddingProcessor', {
      bucket: bucket
    });

    // Initialize the chat construct
    new ChatConstruct(this, 'ChatProcessor', {
      chatHistoryTableName: 'ChatHistory-jku623bccfdvziracnh673rzwe-NONE'
    });
  }
}
