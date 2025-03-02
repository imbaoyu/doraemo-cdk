import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda_event_sources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export interface EmbeddingConstructProps {
    sourceDocumentsBucket: s3.IBucket;
}

export class EmbeddingConstruct extends Construct {
    public readonly processingFunction: lambda.Function;
    public readonly processingQueue: sqs.Queue;
    public readonly embeddingsBucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: EmbeddingConstructProps) {
        super(scope, id);

        const sourceDocumentsBucket = props.sourceDocumentsBucket;

        // Create a new S3 bucket for embeddings
        this.embeddingsBucket = new s3.Bucket(this, 'EmbeddingsBucket', {
            removalPolicy: RemovalPolicy.RETAIN,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            lifecycleRules: [
                {
                    enabled: true,
                    noncurrentVersionExpiration: Duration.days(30),
                }
            ]
        });

        // Create SQS queue for buffering document processing
        this.processingQueue = new sqs.Queue(this, 'EmbeddingProcessingQueue', {
            visibilityTimeout: Duration.minutes(5), // Match Lambda timeout
            retentionPeriod: Duration.days(14),
            deadLetterQueue: {
                queue: new sqs.Queue(this, 'EmbeddingDLQ', {
                    retentionPeriod: Duration.days(14)
                }),
                maxReceiveCount: 3
            }
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
            memorySize: 4096,
            environment: {
                SOURCE_BUCKET_NAME: sourceDocumentsBucket.bucketName,
                EMBEDDINGS_BUCKET_NAME: this.embeddingsBucket.bucketName,
                USER_DOCUMENT_TABLE_NAME: 'UserDocument-jku623bccfdvziracnh673rzwe-NONE'
            },
        });

        // Add Bedrock permissions
        this.processingFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    'bedrock:InvokeModel',
                    'bedrock:InvokeModelWithResponseStream'
                ],
                resources: ['*']
            })
        );

        // Add DynamoDB permissions
        this.processingFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    'dynamodb:GetItem',
                    'dynamodb:UpdateItem',
                ],
                resources: ['arn:aws:dynamodb:us-east-1:*:table/UserDocument-jku623bccfdvziracnh673rzwe-NONE']
            })
        );

        // Add S3 permissions for source bucket (read-only)
        this.processingFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    's3:GetObject',
                    's3:HeadObject',
                ],
                resources: [
                    sourceDocumentsBucket.bucketArn,
                    `${sourceDocumentsBucket.bucketArn}/*`
                ]
            })
        );

        // Add S3 permissions for embeddings bucket (read-write)
        this.processingFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    's3:GetObject',
                    's3:HeadObject',
                    's3:PutObject',
                    's3:DeleteObject',
                    's3:ListBucket'
                ],
                resources: [
                    this.embeddingsBucket.bucketArn,
                    `${this.embeddingsBucket.bucketArn}/*`
                ]
            })
        );

        // Import the SNS topic from the Amplify stack
        const documentUploadTopic = sns.Topic.fromTopicArn(
            this,
            'DocumentUploadTopic',
            `arn:aws:sns:us-east-1:${process.env.CDK_DEFAULT_ACCOUNT}:amplify-d1r842ef96fa1l-main-branch-b7be5fa781-function1351588B-8VEE8MZ44W9R-DocumentUploadTopic75300C01-fcOp7PJgbjjC`
        );

        // Subscribe the SQS queue to the SNS topic
        documentUploadTopic.addSubscription(
            new sns_subscriptions.SqsSubscription(this.processingQueue)
        );

        // Add SQS queue as event source for Lambda
        this.processingFunction.addEventSource(
            new lambda_event_sources.SqsEventSource(this.processingQueue, {
                batchSize: 1, // Process one message at a time
                maxBatchingWindow: Duration.seconds(10)
            })
        );
    }
} 