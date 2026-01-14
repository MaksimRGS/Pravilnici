const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials');
const config = require('./config');

class GraphAuthService {
    constructor() {
        this.credential = null;
        this.client = null;
    }

    async initialize() {
        try {
            // Create credential using client secret
            this.credential = new ClientSecretCredential(
                config.microsoftGraph.tenantId,
                config.microsoftGraph.clientId,
                config.microsoftGraph.clientSecret
            );

            // Create authentication provider
            const authProvider = new TokenCredentialAuthenticationProvider(this.credential, {
                scopes: config.microsoftGraph.scopes
            });

            // Initialize Graph client
            this.client = Client.initWithMiddleware({
                authProvider: authProvider
            });

            console.log('Microsoft Graph authentication initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing Graph authentication:', error.message);
            throw error;
        }
    }

    getClient() {
        if (!this.client) {
            throw new Error('Graph client not initialized. Call initialize() first.');
        }
        return this.client;
    }

    async testConnection() {
        try {
            const client = this.getClient();
            const users = await client.api('/users').top(1).get();
            console.log('Graph API connection test successful');
            return true;
        } catch (error) {
            console.error('Graph API connection test failed:', error.message);
            return false;
        }
    }
}

module.exports = new GraphAuthService();
