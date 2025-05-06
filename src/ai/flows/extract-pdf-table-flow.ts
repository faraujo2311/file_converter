'use server';
/**
 * @fileOverview Extracts tabular data from a PDF file using AI.
 *
 * - extractPdfTable - A function that handles the PDF table extraction process.
 * - ExtractPdfTableInput - The input type for the extractPdfTable function.
 * - ExtractPdfTableOutput - The return type for the extractPdfTable function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const ExtractPdfTableInputSchema = z.object({
  pdfDataUri: z
    .string()
    .describe(
      "The PDF file content as a data URI that must include a MIME type (application/pdf) and use Base64 encoding. Expected format: 'data:application/pdf;base64,<encoded_data>'."
    ),
});
export type ExtractPdfTableInput = z.infer<typeof ExtractPdfTableInputSchema>;

// Define a flexible schema for rows, allowing either object or array format
const RowSchema = z.record(z.string(), z.any()); // Object format: { Header1: Value1, Header2: Value2 }
const RowArraySchema = z.array(z.any()); // Array format: [Value1, Value2]
const FlexibleRowSchema = z.union([RowSchema, RowArraySchema]);

const ExtractPdfTableOutputSchema = z.object({
  headers: z.array(z.string()).describe('The extracted headers of the table.'),
  rows: z.array(FlexibleRowSchema).describe('The extracted rows of the table. Each row can be an object mapping headers to values or an array of values in the order of the headers.'),
   error: z.string().optional().describe('An error message if extraction failed.')
});
export type ExtractPdfTableOutput = z.infer<typeof ExtractPdfTableOutputSchema>;

export async function extractPdfTable(input: ExtractPdfTableInput): Promise<ExtractPdfTableOutput> {
  try {
    return await extractPdfTableFlow(input);
  } catch (error: any) {
     console.error('Error calling extractPdfTableFlow:', error);
     // Return a structured error within the expected output format
     return {
       headers: [],
       rows: [],
       error: `Failed to process PDF: ${error.message || 'Unknown error'}`,
     };
  }
}

const prompt = ai.definePrompt({
  name: 'extractPdfTablePrompt',
  input: {
    schema: ExtractPdfTableInputSchema,
  },
  output: {
    // Request JSON output explicitly, describing the desired structure.
    format: 'json',
    schema: ExtractPdfTableOutputSchema,
  },
  prompt: `Analyze the provided PDF document, which contains tabular data. Your goal is to extract the main table content accurately.

PDF Document: {{media url=pdfDataUri}}

Instructions:
1.  **Identify Headers:** Accurately identify the table headers. Handle multi-line headers if present.
2.  **Extract Rows:** Extract all data rows corresponding to the identified headers.
3.  **Align Data:** Ensure the data in each row aligns correctly with the headers. Handle merged cells if possible, otherwise note potential issues in data alignment.
4.  **Data Types:** Extract numeric values, dates, and text as accurately as possible, preserving their original format from the PDF.
5.  **Focus:** Concentrate on the primary data table. Ignore surrounding text unless it's clearly part of the table structure (e.g., footnotes linked within cells).
6.  **Output Format:** Return the extracted data STRICTLY in the following JSON format:
    \`\`\`json
    {
      "headers": ["Header1", "Header2", ...],
      "rows": [
        // Option 1: Array of Objects (Preferred)
        { "Header1": "Value1A", "Header2": "Value2A", ... },
        { "Header1": "Value1B", "Header2": "Value2B", ... },
        // Option 2: Array of Arrays (Acceptable fallback if object structure is difficult)
        // ["Value1A", "Value2A", ...],
        // ["Value1B", "Value2B", ...],
      ],
      "error": "Optional error message if extraction fails or is unreliable."
    }
    \`\`\`
    Use the array of objects format for 'rows' whenever possible. Use the array of arrays format ONLY if mapping headers to values precisely is too complex. The order of values in the array MUST match the order of the 'headers' array.
7.  **Error Handling:** If you cannot reliably extract a table or encounter significant issues, return empty arrays for 'headers' and 'rows', and provide a clear explanation in the 'error' field. Do not invent data.

Review your extracted headers and the first few rows carefully to ensure accuracy and correct alignment before generating the final JSON output.
`,
});

const extractPdfTableFlow = ai.defineFlow<
  typeof ExtractPdfTableInputSchema,
  typeof ExtractPdfTableOutputSchema
>(
  {
    name: 'extractPdfTableFlow',
    inputSchema: ExtractPdfTableInputSchema,
    outputSchema: ExtractPdfTableOutputSchema,
     // Use a model capable of multimodal input and JSON output
    model: 'googleai/gemini-1.5-flash', // Keep using 1.5 Flash as it's generally good for this
     // Adjust config for potentially longer processing and larger output
    // maxOutputTokens: 4096, // Consider increasing if tables are very large
    // requestConfig: { timeout: 180 }, // Increase timeout to 3 minutes
    // Set temperature to 0 for more deterministic output, crucial for structured data
     generationConfig: { temperature: 0 },
  },
  async input => {
     console.log('Calling AI model for PDF extraction...');
    try {
        // Pass the input directly to the prompt function
        const response = await prompt(input);
        const output = response?.output; // Access output from the response object

        console.log('AI model raw response:', response); // Log the full response for debugging
        console.log('AI model extracted output:', output);

         if (!output) {
           console.error('AI model returned undefined output.');
           return { headers: [], rows: [], error: 'AI model returned no output.' };
         }

         // Basic validation: Check if headers and rows exist and are arrays
         if (!Array.isArray(output.headers) || !Array.isArray(output.rows)) {
            console.warn('AI model output missing headers/rows arrays or incorrect type:', output);
             // Try to provide a more specific error based on what's missing
             let errorMsg = output.error || 'AI model returned incomplete data.';
             if (!Array.isArray(output.headers)) errorMsg += ' Headers are missing or not an array.';
             if (!Array.isArray(output.rows)) errorMsg += ' Rows are missing or not an array.';
            return { headers: [], rows: [], error: errorMsg.trim() };
         }

         // Optional: Add more specific validation (e.g., check row structure consistency) if needed

        return output;
    } catch(e: any) {
        console.error("Error during AI PDF extraction flow execution:", e);
         // Try to capture more specific error details if available
         let errorMessage = `AI processing error: ${e.message || 'Unknown error'}`;
         if (e.cause) {
           errorMessage += ` Cause: ${e.cause}`;
         }
        return { headers: [], rows: [], error: errorMessage };
    }
  }
);
