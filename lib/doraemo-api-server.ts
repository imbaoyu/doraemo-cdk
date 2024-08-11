import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DoraemoApiServerProps {
    name: string
}

export class DoraemoApiServer extends Construct {
    public readonly handler: lambda.Function
    public readonly table: dynamodb.Table

    constructor(scope: Construct, id: string, props: DoraemoApiServerProps) {
        super(scope, id)
        const table= new dynamodb.Table(this, 'UserTable', {
            partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING }
        });
        this.table = table;

        this.handler = new lambda.Function(this, 'ApiHandler', {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'doraemo-api-lambda.lambda_handler',
            code: lambda.Code.fromAsset('../doraemo/lambda/python'),
            environment: {
                USER_TABLE_NAME: table.tableName,
                PROPS_NAME: props.name
            }
        });
        table.grantReadWriteData(this.handler);
    }
}