const authService = require('./authService');
const aiService = require('./aiService');
const documentService = require('./documentService');
const config = require('./config');
const fs = require('fs').promises;
const path = require('path');

class EmailMonitor {
    constructor() {
        this.processedEmails = new Set();
        this.processedEmailsFile = path.join(__dirname, 'processed-emails.json');
        this.isRunning = false;
    }

    async initialize() {
        try {
            await authService.initialize();
            await this.loadProcessedEmails();

            // Load and display available documents
            await documentService.loadDocuments();
            const docList = await documentService.listDocuments();
            console.log(`\n📚 Loaded regulation documents (${docList.length}):`);
            docList.forEach((doc, index) => {
                console.log(`   ${index + 1}. ${doc}`);
            });
            console.log('');

            console.log('Email monitor initialized successfully');
        } catch (error) {
            console.error('Error initializing email monitor:', error.message);
            throw error;
        }
    }

    async loadProcessedEmails() {
        try {
            const data = await fs.readFile(this.processedEmailsFile, 'utf8');
            const emails = JSON.parse(data);
            this.processedEmails = new Set(emails);
            console.log(`Loaded ${this.processedEmails.size} processed email IDs`);
        } catch (error) {
            // File doesn't exist yet, start fresh
            console.log('No processed emails file found, starting fresh');
            this.processedEmails = new Set();
        }
    }

    async saveProcessedEmails() {
        try {
            const emails = Array.from(this.processedEmails);
            await fs.writeFile(this.processedEmailsFile, JSON.stringify(emails, null, 2));
        } catch (error) {
            console.error('Error saving processed emails:', error.message);
        }
    }

    async getUnreadEmails(userEmail) {
        try {
            const client = authService.getClient();

            // Get the user ID for the specified email
            const users = await client.api('/users')
                .filter(`mail eq '${userEmail}' or userPrincipalName eq '${userEmail}'`)
                .get();

            if (!users.value || users.value.length === 0) {
                console.log(`User not found: ${userEmail}`);
                return [];
            }

            const userId = users.value[0].id;

            // Fetch unread messages from inbox
            const messages = await client.api(`/users/${userId}/mailFolders/inbox/messages`)
                .filter('isRead eq false')
                .select('id,subject,from,bodyPreview,body,receivedDateTime')
                .orderby('receivedDateTime desc')
                .top(50)
                .get();

            return messages.value || [];
        } catch (error) {
            console.error(`Error fetching emails for ${userEmail}:`, error.message);
            return [];
        }
    }

    convertToHtml(textBody) {
        // Convert plain text to HTML with hyperlinks
        const lines = textBody.split('\n');
        let html = '<html><body style="font-family: Arial, sans-serif; line-height: 1.6;">';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if next line starts with "Link: "
            if (i + 1 < lines.length && lines[i + 1].startsWith('Link: ')) {
                const url = lines[i + 1].substring(6).trim();
                // Make the current line (document name) a hyperlink
                html += `<p><strong>Izvor:</strong> <a href="${url}" style="color: #0066cc; text-decoration: none;">${line.replace('Izvor: ', '')}</a></p>`;
                i++; // Skip the next line (Link: ...)
            } else if (line.trim() === '') {
                html += '<br>';
            } else {
                html += `<p style="margin: 5px 0;">${line}</p>`;
            }
        }

        html += '</body></html>';
        return html;
    }

    async sendReply(userEmail, originalMessageId, replyBody) {
        try {
            const client = authService.getClient();

            // Get the user ID
            const users = await client.api('/users')
                .filter(`mail eq '${userEmail}' or userPrincipalName eq '${userEmail}'`)
                .get();

            if (!users.value || users.value.length === 0) {
                throw new Error(`User not found: ${userEmail}`);
            }

            const userId = users.value[0].id;

            // Convert our text reply to HTML with hyperlinks
            const replyHtml = this.convertToHtml(replyBody);

            // Extract just the body content (remove html/body tags) for use as comment
            const commentContent = replyHtml.replace(/<\/?html>/g, '').replace(/<\/?body[^>]*>/g, '').trim();

            // Use the comment field to preserve conversation thread
            // The Graph API automatically appends the original message when using comment
            const reply = {
                comment: commentContent
            };

            await client.api(`/users/${userId}/messages/${originalMessageId}/reply`)
                .post(reply);

            console.log(`Reply sent successfully for message ${originalMessageId}`);
            return true;
        } catch (error) {
            console.error('Error sending reply:', error.message);
            return false;
        }
    }

    async markAsRead(userEmail, messageId) {
        try {
            const client = authService.getClient();

            const users = await client.api('/users')
                .filter(`mail eq '${userEmail}' or userPrincipalName eq '${userEmail}'`)
                .get();

            if (!users.value || users.value.length === 0) {
                throw new Error(`User not found: ${userEmail}`);
            }

            const userId = users.value[0].id;

            await client.api(`/users/${userId}/messages/${messageId}`)
                .update({ isRead: true });

            console.log(`Marked message ${messageId} as read`);
            return true;
        } catch (error) {
            console.error('Error marking message as read:', error.message);
            return false;
        }
    }

    isAllowedDomain(email) {
        const allowedDomains = ['smart.edu.rs'];
        const allowedPartialDomain = 'maksimmalbasa.in.rs';

        const emailLower = email.toLowerCase();
        const domain = emailLower.split('@')[1];

        if (!domain) {
            return false;
        }

        // Check exact domain match
        if (allowedDomains.includes(domain)) {
            return true;
        }

        // Check if domain contains maksimmalbasa.in.rs
        if (domain.includes(allowedPartialDomain)) {
            return true;
        }

        return false;
    }

    async processEmail(userEmail, message) {
        try {
            console.log(`\n--- Processing email from ${message.from.emailAddress.address} ---`);
            console.log(`Subject: ${message.subject}`);
            console.log(`Received: ${message.receivedDateTime}`);

            // SECURITY: Check if sender domain is allowed
            const senderEmail = message.from.emailAddress.address;
            if (!this.isAllowedDomain(senderEmail)) {
                console.log(`⚠️ REJECTED: Email from ${senderEmail} - domain not allowed`);
                console.log(`Allowed: smart.edu.rs and domains containing maksimmalbasa.in.rs`);

                // Mark as read but don't respond
                await this.markAsRead(userEmail, message.id);
                this.processedEmails.add(message.id);
                await this.saveProcessedEmails();

                console.log(`Email from unauthorized domain marked as read and ignored.`);
                return;
            }

            // Extract email body (always use full content, strip HTML if needed)
            let emailBody = message.body.content || message.bodyPreview;

            // If HTML, strip basic tags for cleaner text
            if (message.body.contentType === 'HTML') {
                emailBody = emailBody
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .trim();
            }

            const senderName = message.from.emailAddress.name || '';
            console.log(`Sender: ${senderName} (${message.from.emailAddress.address})`);
            console.log(`Email body length: ${emailBody.length} characters`);
            console.log(`Email body preview (first 300 chars): ${emailBody.substring(0, 300)}...`);

            // Generate AI response based on regulations
            console.log('Generating AI response based on regulations...');
            const aiResponse = await aiService.generateResponse(
                message.subject,
                emailBody,
                message.from.emailAddress.address
            );

            console.log('AI Response generated:');
            console.log(aiResponse.substring(0, 200) + '...');

            // Send reply
            console.log('Sending reply...');
            const replySent = await this.sendReply(
                userEmail,
                message.id,
                aiResponse
            );

            if (replySent) {
                // Mark as read
                await this.markAsRead(userEmail, message.id);

                // Mark as processed
                this.processedEmails.add(message.id);
                await this.saveProcessedEmails();

                console.log(`✓ Successfully processed and replied to email ${message.id}`);
            } else {
                console.log(`✗ Failed to send reply for email ${message.id}`);
            }

        } catch (error) {
            console.error('Error processing email:', error.message);
        }
    }

    async checkEmails() {
        console.log('\n=== Checking for new emails ===');
        console.log(new Date().toLocaleString('sr-RS', { timeZone: 'Europe/Belgrade' }));

        for (const monitoredEmail of config.monitoredEmails) {
            try {
                console.log(`\nChecking ${monitoredEmail}...`);
                const unreadEmails = await this.getUnreadEmails(monitoredEmail);

                console.log(`Found ${unreadEmails.length} unread emails`);

                for (const email of unreadEmails) {
                    // Skip if already processed
                    if (this.processedEmails.has(email.id)) {
                        console.log(`Skipping already processed email: ${email.id}`);
                        continue;
                    }

                    await this.processEmail(monitoredEmail, email);
                }

            } catch (error) {
                console.error(`Error checking ${monitoredEmail}:`, error.message);
            }
        }

        console.log('\n=== Email check complete ===\n');
    }

    async start() {
        if (this.isRunning) {
            console.log('Email monitor is already running');
            return;
        }

        this.isRunning = true;
        console.log('Starting email monitor...');
        console.log(`Monitoring: ${config.monitoredEmails.join(', ')}`);
        console.log(`Polling interval: ${config.pollingInterval / 1000} seconds`);

        // Initial check
        await this.checkEmails();

        // Set up periodic checking
        this.intervalId = setInterval(async () => {
            await this.checkEmails();
        }, config.pollingInterval);

        console.log('Email monitor is now running');
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.isRunning = false;
            console.log('Email monitor stopped');
        }
    }
}

module.exports = new EmailMonitor();
