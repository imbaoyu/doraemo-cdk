import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export interface ChatConstructProps {
    chatHistoryTableName: string;
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
            code: lambda.DockerImageCode.fromEcr(dockerImageAsset.repository, {
                tagOrDigest: dockerImageAsset.imageTag
            }),
            timeout: Duration.minutes(5),
            memorySize: 1024,
            environment: {
                CHAT_HISTORY_TABLE_NAME: props.chatHistoryTableName,
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
                resources: ['*'] // You might want to restrict this to specific table ARN
            })
        );
    }
} 