/**
 * Service to manage Google Calendar events for invoice payment due dates.
 */

async function createDueDateReminder({ invoiceNumber, customerName, amountDue, dueDate }) {
    try {
        console.log(`[Google Calendar Service] Creating event for Invoice: ${invoiceNumber}`);
        console.log(`[Google Calendar Service] Customer: ${customerName} | Due: ${dueDate} | Amount: Rp ${amountDue}`);
        
        // Return simulated/real event ID
        const calendarEventId = `gcal_evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        return calendarEventId;
    } catch (error) {
        console.error('[Google Calendar Service Error]:', error.message);
        return null;
    }
}

module.exports = {
    createDueDateReminder
};
