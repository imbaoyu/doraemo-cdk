import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';

export interface DoraemoCrawlerProps {
    name: string;
}

export class DoraemoCrawler extends Construct {
    public readonly handler: lambda.Function;
    public readonly table: dynamodb.Table;
    public readonly url: string;
    public readonly getEndpoints: string[];

    constructor(scope: Construct, id: string, props: DoraemoCrawlerProps) {
        super(scope, id);

        // Create DynamoDB table
        this.table = new dynamodb.Table(this, 'CrawlerTable', {
            partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }
        });

        // Create Lambda function
        this.handler = new lambda.Function(this, 'CrawlerHandler', {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'doraemo-crawler-lambda.lambda_handler',
            code: lambda.Code.fromAsset('../doraemo/lambda/python'),
            environment: {
                CRAWLER_TABLE_NAME: this.table.tableName,
                PROPS_NAME: props.name
            }
        });
        this.table.grantReadWriteData(this.handler);

        // Add this at the end of the constructor
        new cdk.CfnOutput(this, 'CrawlerEndpoint', {
            value: this.handler.functionArn,
            description: 'The ARN of the lambda function',
            exportName: `${id}-CrawlerLambda`,
        });
    }
}