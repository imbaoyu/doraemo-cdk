import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface EmbeddingConstructProps {
    bucket: s3.IBucket;
}

export class EmbeddingConstruct extends Construct {
    public readonly processingQueue: sqs.Queue;
    public readonly processingFunction: lambda.Function;

    constructor(scope: Construct, id: string, props: EmbeddingConstructProps) {
        super(scope, id);

        const bucket = props.bucket;

        // Create an SQS queue for processing events
        this.processingQueue = new sqs.Queue(this, 'EmbeddingQueue', {
            visibilityTimeout: Duration.seconds(300),
            retentionPeriod: Duration.days(14),
        });

        // Create a Lambda function for processing files
        this.processingFunction = new lambda.Function(this, 'EmbeddingProcessor', {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/embedding-processor', {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                    command: [
                        'bash', '-c',
                        'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
                    ],
                },
            }),
            timeout: Duration.minutes(5),
            memorySize: 1024,
            environment: {
                BUCKET_NAME: bucket.bucketName,
            },
        });

        // Grant the Lambda function permissions to read from S3
        bucket.grantRead(this.processingFunction);

        // Add S3 notification to SQS
        bucket.addEventNotification(
            s3.EventType.OBJECT_CREATED,
            new s3n.SqsDestination(this.processingQueue)
        );

        // Add SQS as event source for Lambda
        this.processingFunction.addEventSource(
            new lambdaEventSources.SqsEventSource(this.processingQueue, {
                batchSize: 1,
            })
        );
    }
} 