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
    schema: ExtractPdfTableOutputSchema,
  },
  prompt: `Analyze the provided PDF document, which contains tabular data. Extract the main table content.

PDF Document: {{media url=pdfDataUri}}

Identify the table headers accurately.
Extract all data rows corresponding to these headers.
Ensure the data in each row aligns correctly with the identified headers.
Return the extracted data in the specified JSON format with 'headers' as an array of strings and 'rows' as an array of objects, where each object maps header names to cell values. If an object structure is difficult, an array of values per row, matching the header order, is acceptable.

If you cannot reliably extract a table, return empty arrays for headers and rows and provide an explanation in the 'error' field. Focus on the primary data table, ignoring surrounding text unless it's part of the table structure. Pay close attention to multi-line headers or cells if they exist. Handle merged cells appropriately if possible, otherwise note potential issues. Extract numeric values and dates as accurately as possible, preserving their original format from the PDF.
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
     // Use a model capable of multimodal input
    model: 'googleai/gemini-1.5-flash',
    // Increase max output tokens if needed for large tables
    // maxOutputTokens: 4096, // Example
    // Increase timeout if processing takes longer
    // requestConfig: { timeout: 120 }, // Example: 120 seconds
  },
  async input => {
     console.log('Calling AI model for PDF extraction...');
    try {
        const {output} = await prompt(input);
        console.log('AI model response received:', output);
         if (!output) {
           console.error('AI model returned undefined output.');
           return { headers: [], rows: [], error: 'AI model returned no output.' };
         }
         // Basic validation
         if (!output.headers || !output.rows) {
            console.warn('AI model output missing headers or rows:', output);
            return { headers: [], rows: [], error: output.error || 'AI model returned incomplete data (missing headers or rows).' };
         }
        return output;
    } catch(e: any) {
        console.error("Error during AI PDF extraction prompt call:", e);
        return { headers: [], rows: [], error: `AI processing error: ${e.message || 'Unknown error'}` };
    }
  }
);
