import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { HitCounter } from "./hitcounter";
import { TableViewer } from 'cdk-dynamo-table-viewer';
import { CognitoUserPool } from './congito-user-pool';

export class DoraemoCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Main components of Doraemo
    const cognitoUserPool = new CognitoUserPool(this, 'CognitoUserPool', {
      name: 'MainUserPool',
      apiUrl: 'https://example.com'
    });
  }
}
