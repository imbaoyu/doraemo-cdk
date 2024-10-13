import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface DoraemoChatProps {
    name: string;
}

export class DoraemoChatStack extends Construct {
    public readonly handler: lambda.Function;
    public readonly table: dynamodb.Table;
    public readonly url: string;
    public readonly getEndpoints: string[];

    constructor(scope: Construct, id: string, props: DoraemoChatProps) {
        super(scope, id);

        // Create DynamoDB table
        this.table = new dynamodb.Table(this, 'ConversationHistoryTable', {
            partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
        });

        // Create Lambda function
        this.handler = new lambda.Function(this, 'DoraemoChatHandler', {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'doraemo-bot-lambda.lambda_handler',
            code: lambda.Code.fromAsset('../doraemo-web/doraemo-web-lambda/python', {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_12.bundlingImage,
                    command: [
                        'bash', '-c',
                        'pip install --platform manylinux2014_x86_64 --only-binary=:all: -r requirements.txt -t /asset-output && cp -au . /asset-output'
                    ],
                }
            }),
            environment: {
                CONVERSATION_HISTORY_TABLE_NAME: this.table.tableName,
                PROPS_NAME: props.name
            }
        });

        // Grant DynamoDB permissions
        this.table.grantReadWriteData(this.handler);

        // Grant Bedrock permissions
        // https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonbedrock.html
        this.handler.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
                'bedrock:RetrieveAndGenerate',
                'bedrock:InvokeAgent',
                'bedrock:InvokeBuilder',
                'bedrock:InvokeFlow'
            ],
            resources: ['*'], // You might want to restrict this to specific Bedrock model ARNs
        }));

        // Add this at the end of the constructor
        new cdk.CfnOutput(this, 'ChatEndpoint', {
            value: this.handler.functionArn,
            description: 'The ARN of the lambda function',
            exportName: `${id}-ChatLambda`,
        });
    }
}
