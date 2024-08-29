import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2_authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { CognitoUserPool } from './congito-user-pool';

export interface DoraemoApiServerProps {
    name: string;
    userPool: cognito.IUserPool;
    userPoolClient: cognito.IUserPoolClient;
    cognitoUserPool: CognitoUserPool;
}

export class DoraemoApiServer extends Construct {
    public readonly handler: lambda.Function;
    public readonly table: dynamodb.Table;
    public readonly api: apigatewayv2.HttpApi;
    public readonly url: string;
    public readonly getEndpoints: string[];

    constructor(scope: Construct, id: string, props: DoraemoApiServerProps) {
        super(scope, id);

        // Create DynamoDB table
        this.table = new dynamodb.Table(this, 'UserTable', {
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING }
        });

        // Create Lambda function
        this.handler = new lambda.Function(this, 'ApiHandler', {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'doraemo-api-lambda.lambda_handler',
            code: lambda.Code.fromAsset('../doraemo/lambda/python'),
            environment: {
                USER_TABLE_NAME: this.table.tableName,
                PROPS_NAME: props.name
            }
        });
        this.table.grantReadWriteData(this.handler);

        // Create HTTP API
        this.api = new apigatewayv2.HttpApi(this, 'DoraemoApi', {
            apiName: props.name
        });

        // Create Cognito Authorizer
        const authorizer = new apigatewayv2_authorizers.HttpUserPoolAuthorizer('DoraemoAuthorizer', props.userPool, {
            userPoolClients: [props.userPoolClient]
        });

        // Add route with Lambda integration and Cognito authorizer
        this.api.addRoutes({
            path: '/doraemo',
            methods: [apigatewayv2.HttpMethod.GET],
            integration: new apigatewayv2_integrations.HttpLambdaIntegration('DoraemoIntegration', this.handler),
            authorizer
        });

        // You can add more routes as needed, following the same pattern

        // Add this at the end of the constructor
        new cdk.CfnOutput(this, 'ApiEndpoint', {
            value: this.api.apiEndpoint,
            description: 'The endpoint URL of the API',
            exportName: `${id}-ApiEndpoint`,
        });

        this.url = this.api.apiEndpoint;
        this.getEndpoints = ['/doraemo']; // Add your actual GET endpoints

        // Add GET endpoints to Cognito User Pool's allowed URLs
        this.getEndpoints.forEach(endpoint => {
            props.cognitoUserPool.addAllowedUrl(`${this.url}${endpoint}`);
        });
    }
}