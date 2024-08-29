import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface CognitoUserPoolProps {
    name: string;
    apiUrl: string;
}

export class CognitoUserPool extends Construct {
    public readonly userPool: cognito.IUserPool;
    public readonly userPoolClient: cognito.IUserPoolClient;
    private domain: cognito.UserPoolDomain;
    private callbackUrls: string[];
    private logoutUrls: string[];

    constructor(scope: Construct, id: string, props: CognitoUserPoolProps) {
        super(scope, id);

        // Create a Cognito User Pool
        this.userPool = new cognito.UserPool(this, 'UserPool', {
            userPoolName: props.name,
            signInCaseSensitive: false,
            selfSignUpEnabled: true,
            userVerification: {
                emailStyle: cognito.VerificationEmailStyle.LINK,
                emailSubject: 'Invite to join the Doraemo app!',
                emailBody: 'You have been invited to join the Doraemo app! {##Verify Your Email##}',
            },
            signInAliases: { email: true },
            autoVerify: { email: true },
            standardAttributes: {
                email: { required: true, mutable: true },
            },
        });

        // Create a User Pool Client
        this.callbackUrls = ['https://example.com'];
        this.logoutUrls = ['https://example.com'];

        this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
            userPool: this.userPool,
            userPoolClientName: `${props.name}-client`,
            generateSecret: false,
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                },
                scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
                callbackUrls: this.callbackUrls,
                logoutUrls: this.logoutUrls,
            },
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
                cognito.UserPoolClientIdentityProvider.GOOGLE,
            ],
        });

        // Add Google as an identity provider
        // This creates a Google identity provider for the Cognito User Pool
        // It allows users to sign in to the app using their Google accounts
        const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
            userPool: this.userPool,
            clientId: '561729478757-277sajmem59fnq638bhib9fgd5ufou8q.apps.googleusercontent.com',
            clientSecretValue: cdk.SecretValue.secretsManager('arn:aws:secretsmanager:us-east-1:847373240038:secret:google-client-secret-QUhsYQ'),
            scopes: ['profile', 'email', 'openid'],
            attributeMapping: {
                email: cognito.ProviderAttribute.GOOGLE_EMAIL,
                givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
                familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
            },
        });

        this.userPoolClient.node.addDependency(googleProvider);

        // Add domain to the User Pool
        const domain = this.userPool.addDomain('CognitoDomain', {
            cognitoDomain: {
                domainPrefix: 'doraemo',
            },
        });

        // Construct the full login URL
        const loginUrl = `${domain.baseUrl()}/login?client_id=${this.userPoolClient.userPoolClientId}&response_type=code&redirect_uri=${encodeURIComponent(props.apiUrl + '/doraemo')}`;

        // Output the full Hosted UI login URL
        new cdk.CfnOutput(this, 'HostedUILoginURL', {
            value: loginUrl,
            description: 'The URL of the Cognito Hosted UI login page',
        });

        // Add allowed URL method
    }

    public addAllowedUrl(url: string, isCallback: boolean = true, isLogout: boolean = true) {
        if (isCallback && !this.callbackUrls.includes(url)) {
            this.callbackUrls.push(url);
        }
        if (isLogout && !this.logoutUrls.includes(url)) {
            this.logoutUrls.push(url);
        }

        // Update the User Pool Client
        (this.userPoolClient.node.defaultChild as cognito.CfnUserPoolClient).callbackUrLs = this.callbackUrls;
        (this.userPoolClient.node.defaultChild as cognito.CfnUserPoolClient).logoutUrLs = this.logoutUrls;
    }
}