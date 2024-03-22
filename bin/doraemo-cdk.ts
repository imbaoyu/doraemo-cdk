#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DoraemoCdkStack } from '../lib/doraemo-cdk-stack';

const app = new cdk.App();
new DoraemoCdkStack(app, 'DoraemoCdkStack');
