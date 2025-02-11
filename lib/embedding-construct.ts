import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

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

        // Create Docker image asset
        const dockerImageAsset = new ecr_assets.DockerImageAsset(this, 'EmbeddingProcessorImage', {
            directory: path.join(__dirname, '../lambda/embedding-processor'),
            platform: ecr_assets.Platform.LINUX_AMD64,
        });

        // Create a Lambda function using container image
        this.processingFunction = new lambda.DockerImageFunction(this, 'EmbeddingProcessor', {
            code: lambda.DockerImageCode.fromEcr(dockerImageAsset.repository, {
                tagOrDigest: dockerImageAsset.imageTag
            }),
            timeout: Duration.minutes(5),
            memorySize: 2048,
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