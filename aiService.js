const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('./config');
const documentService = require('./documentService');

class AIService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    }

    async generateResponse(emailSubject, emailBody, senderEmail) {
        try {
            console.log('\n=== AI SERVICE DEBUG (GRAPH2) ===');
            console.log('Email Subject:', emailSubject);
            console.log('Email Body (first 200 chars):', emailBody.substring(0, 200));
            console.log('Sender Email:', senderEmail);

            // Get all regulation documents
            await documentService.loadDocuments();
            const regulationContext = documentService.formatDocumentsForAI();

            // Get document list for creating links
            const documents = await documentService.getDocuments();
            const documentLinks = documents.map(doc => {
                const encodedName = encodeURIComponent(doc.filename);
                return `${doc.filename} - http://mails.maksimmalbasa.in.rs/dokumenti/${encodedName}`;
            }).join('\n');

            // Create the prompt for Gemini
            const prompt = `You are an AI assistant for school regulations. IMPORTANT: Reply in THE SAME LANGUAGE as the email is written (Serbian or English).

EMAIL FROM: ${senderEmail}
SUBJECT: ${emailSubject}
EMAIL CONTENT:
${emailBody}

AVAILABLE REGULATIONS:
${regulationContext}

DOCUMENT LINKS (for citing sources):
${documentLinks}

INSTRUCTIONS:
1. CRITICAL: Detect the language of the email above and reply in THE EXACT SAME LANGUAGE
   - If email is in Serbian → reply in Serbian
   - If email is in English → reply in English
   - Check keywords: "what", "when", "rule" = English; "šta", "kada", "pravilo" = Serbian
2. Be professional and friendly
3. FOR SERBIAN: When addressing a person by name, use VOCATIVE CASE (vokativ):
   - "Maksim" → "Maksime"
   - "Ivan" → "Ivane"
   - "Marko" → "Marko"
   - "Petar" → "Petre"
   - "Ana" → "Ana" or "Ano"
   - Examples: "Poštovani Maksime," (Serbian), "Dear Maksim," (English)
4. Use ONLY information from available regulations - do NOT fabricate facts
5. CRITICAL REASONING REQUIREMENT:
   - When asked a YES/NO question, you MUST provide a direct answer (DA/NE or YES/NO)
   - ANALYZE the regulations provided and INTERPRET them to answer the specific question
   - DO NOT just copy-paste regulations - THINK about what they mean
   - Start with your direct answer, THEN explain your reasoning
   - Example: "NE, nastavnik ne sme promeniti tip testiranja. Evo zašto: [explanation]"
   - Example: "DA, to je dozvoljeno prema članu X. Obrazloženje: [reasoning]"
6. If relevant information exists in regulations, quote it accurately AFTER giving your answer
7. If no information available, clearly state: "U dostupnim pravilnicima nemam informacije o tome." (Serbian) or "I don't have information about that in the available regulations." (English)
8. Sign as "AI Asistent - Školski Pravilnici" (Serbian) or "AI Assistant - School Regulations" (English)
9. IMPORTANT: Format response as PLAIN TEXT for email
10. DO NOT use markdown, bold (**), italics (*), bullet points with *
11. Use plain dashes (-) for lists or enumerations
12. Use plain new lines to separate items
13. Be accurate and precise - these are official school regulations
14. IMPORTANT: When citing a document source, ALWAYS add link in this format:
    "Izvor: [Document Name]" or "Source: [Document Name]"
    "Link: [URL]" (on new line)
    Use links from the list above "DOCUMENT LINKS"
    Link must be ALONE on a line to be clickable in email clients

FORMAT ODGOVORA (primer za DA/NE pitanje):
Poštovani Maksime,

NE, nastavnik ne sme da promeni tip testiranja za učenika koji naknadno radi pismenu proveru.

Obrazloženje: Pravilnik o ocenjivanju propisuje da svi učenici jednog odeljenja moraju imati iste uslove pri proveri znanja. Ako je ostatak odeljenja radio pismeni kontrolni zadatak, učenik koji naknadno radi proveru takođe mora raditi pismeni kontrolni zadatak. Promena tipa testiranja (sa pismenog na usmeni) narušava princip jednakosti i nije dozvoljena.

Relevantne odredbe se nalaze u članu 14 koji reguliše opšte principe ocenjivanja i jednakost uslova za sve učenike.

Izvor: Pravilnik o ocenjivanju.pdf
Link: http://mails.maksimmalbasa.in.rs/dokumenti/Pravilnik%20o%20ocenjivanju.pdf

S poštovanjem,
AI Asistent - Školski Pravilnici

FORMAT ODGOVORA (primer za informativno pitanje):
Poštovani,

Hvala na upitu. Prema dostupnim pravilnicima:

[Odgovor sa relevantnim informacijama iz pravilnika]

Izvor: Pravilnik o ocenjivanju.pdf
Link: http://mails.maksimmalbasa.in.rs/dokumenti/Pravilnik%20o%20ocenjivanju.pdf

S poštovanjem,
AI Asistent - Školski Pravilnici

PRAVILA FORMATIRANJA:
- Uvek ostavi PRAZNU LINIJU između paragrafa
- Uvek ostavi PRAZNU LINIJU između pozdrava i potpisa
- Uvek ostavi PRAZNU LINIJU nakon pozdrava
- Budi koncizan ali informativan
- Koristi jednostavan jezik za lakše razumevanje

Napiši odgovor:`;

            console.log('Prompt length:', prompt.length);
            console.log('Prompt preview (first 500 chars):', prompt.substring(0, 500));

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            console.log('AI Response length:', text.length);
            console.log('AI Response preview (first 300 chars):', text.substring(0, 300));
            console.log('=== END AI DEBUG (GRAPH2) ===\n');

            return text;
        } catch (error) {
            console.error('Error generating AI response:', error.message);

            // Fallback response in case of AI error
            return `Poštovani,

Hvala vam na vašem upitu. Trenutno imamo tehničkih problema sa automatskim generisanjem odgovora.

Molimo vas da pokušate ponovo kasnije ili kontaktirajte administratora.

S poštovanjem,
AI Asistent - Školski Pravilnici`;
        }
    }
}

module.exports = new AIService();
