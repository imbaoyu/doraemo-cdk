import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { HitCounter } from "./hitcounter";
import { TableViewer } from 'cdk-dynamo-table-viewer';
import { DoraemoApiServer } from "./doraemo-api-server";
import { CognitoUserPool } from './congito-user-pool';

export class DoraemoCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // lambda resources
    const hello = new lambda.Function(this, 'HelloHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'hello.handler'
    });

    const helloWithCounter = new HitCounter(this, 'HelloHitCounter', {
      downstream: hello
    });

    new apigateway.LambdaRestApi(this, 'Endpoint', {
      handler: helloWithCounter.handler,
    });

    new TableViewer(this, 'ViewHitCounter', {
      title: 'HelloHits',
      table: helloWithCounter.table,
    });

    // Main components of Doraemo
    const cognitoUserPool = new CognitoUserPool(this, 'CognitoUserPool', {
      name: 'MainUserPool',
      apiUrl: 'https://example.com'
    });

    const apiServer: DoraemoApiServer = new DoraemoApiServer(this, 'DoramoApiServer', {
      name: 'ApiServer',
      userPool: cognitoUserPool.userPool,
      userPoolClient: cognitoUserPool.userPoolClient,
      cognitoUserPool: cognitoUserPool,
    });

    // Add all GET endpoints to allowed URLs
    apiServer.getEndpoints.forEach(endpoint => {
      cognitoUserPool.addAllowedUrl(`${apiServer.url}${endpoint}`);
    });
  }
}
