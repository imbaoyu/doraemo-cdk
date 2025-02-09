import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EmbeddingStack } from './embedding-stack';

export class DoraemoCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing bucket
    const bucket = s3.Bucket.fromBucketName(this, 
        'UserDocumentBucket', 
        'amplify-d1r842ef96fa1l-ma-doraemowebamplifystorage-7izfszqdd3ed ');

    // Initialize the EmbeddingStack
    new EmbeddingStack(this, 'EmbeddingStack', {
      bucket: bucket
    });
  }
}
