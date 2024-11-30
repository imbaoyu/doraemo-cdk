import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';

export class EmbeddingStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an S3 bucket for file uploads
    const bucket = new s3.Bucket(this, 'DocumentBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create an SQS queue for processing events
    const queue = new sqs.Queue(this, 'EmbeddingQueue', {
      visibilityTimeout: Duration.seconds(300), // 5 minutes
      retentionPeriod: Duration.days(14),
    });

    // Create a Lambda function for processing files
    const processingLambda = new lambda.Function(this, 'EmbeddingProcessor', {
      runtime: Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/embedding-processor'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        BUCKET_NAME: bucket.bucketName,
      },
    });

    // Grant the Lambda function permissions to read from S3
    bucket.grantRead(processingLambda);

    // Add S3 notification to SQS
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(queue)
    );

    // Add SQS as event source for Lambda
    processingLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(queue, {
        batchSize: 1,
      })
    );
  }
}
