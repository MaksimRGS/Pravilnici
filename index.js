const emailMonitor = require('./emailMonitor');

async function main() {
    console.log('===========================================');
    console.log('  School Regulations Email System');
    console.log('  Microsoft Graph + Gemini AI');
    console.log('===========================================\n');

    try {
        // Initialize the email monitor
        await emailMonitor.initialize();

        // Start monitoring
        await emailMonitor.start();

        console.log('\nPress Ctrl+C to stop the service\n');

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n\nShutting down gracefully...');
            emailMonitor.stop();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\n\nShutting down gracefully...');
            emailMonitor.stop();
            process.exit(0);
        });

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the service
main();
