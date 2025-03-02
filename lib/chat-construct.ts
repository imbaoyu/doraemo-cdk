import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export interface ChatConstructProps {
    chatHistoryTableName: string;
    embedingsBucketName?: string; // Optional bucket name for embeddings
}

export class ChatConstruct extends Construct {
    public readonly processingFunction: lambda.Function;

    constructor(scope: Construct, id: string, props: ChatConstructProps) {
        super(scope, id);

        // Create Docker image asset
        const dockerImageAsset = new ecr_assets.DockerImageAsset(this, 'ChatProcessorImage', {
            directory: path.join(__dirname, '../lambda/chat-processor'),
            platform: ecr_assets.Platform.LINUX_AMD64,
        });

        // Create a Lambda function using container image
        this.processingFunction = new lambda.DockerImageFunction(this, 'ChatProcessor', {
            functionName: 'DoraemoCdkStack-ChatProcessor',
            code: lambda.DockerImageCode.fromEcr(dockerImageAsset.repository, {
                tagOrDigest: dockerImageAsset.imageTag
            }),
            timeout: Duration.minutes(15),
            memorySize: 2048,
            environment: {
                CHAT_HISTORY_TABLE_NAME: props.chatHistoryTableName,
                S3_BUCKET_NAME: props.embedingsBucketName || 'doraemo-embeddings',
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
                    'dynamodb:PutItem',
                    'dynamodb:GetItem',
                    'dynamodb:Query'
                ],
                resources: ['*'] // restrict this to specific table ARN
            })
        );
        
        // Add S3 permissions for LanceDB operations
        this.processingFunction.addToRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    's3:GetObject',
                    's3:PutObject',
                    's3:ListBucket',
                    's3:GetBucketLocation',
                    's3:ListMultipartUploadParts',
                    's3:AbortMultipartUpload',
                ],
                resources: [
                    `arn:aws:s3:::${props.embedingsBucketName || 'doraemo-embeddings'}`,
                    `arn:aws:s3:::${props.embedingsBucketName || 'doraemo-embeddings'}/*`
                ]
            })
        );
    }
} 