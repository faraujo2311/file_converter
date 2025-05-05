"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import iconv from 'iconv-lite'; // Import iconv-lite for encoding

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, FileText, FileSpreadsheet, Settings, ArrowRight, Trash2, Plus, HelpCircle, Columns, Edit, Code, Loader2, Save } from 'lucide-react'; // Added Edit, Code, Loader2, Save
import { useToast } from "@/hooks/use-toast";
import { Textarea } from '@/components/ui/textarea';
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog"; // Import Dialog components
import { extractPdfTable, type ExtractPdfTableOutput } from '@/ai/flows/extract-pdf-table-flow'; // Import the AI flow
import { Checkbox } from '@/components/ui/checkbox'; // Import Checkbox

// Define types
type DataType = 'Inteiro' | 'Alfanumérico' | 'Numérico' | 'Data' | 'CPF' | 'CNPJ'; // Removed 'Texto' and 'Contábil'
type PredefinedField = { id: string; name: string; isCore?: boolean; comment?: string }; // Add comment field
type ColumnMapping = {
  originalHeader: string;
  mappedField: string | null; // ID of predefined field or null
  dataType: DataType | null;
  length?: number | null;
  removeMask: boolean;
};
type OutputFormat = 'txt' | 'csv';
type PaddingDirection = 'left' | 'right';
type DateFormat = 'YYYYMMDD' | 'DDMMYYYY'; // Added DateFormat type
type OutputEncoding = 'UTF-8' | 'ISO-8859-1' | 'Windows-1252'; // Added OutputEncoding type

// Consolidated Output Field Type using discriminated union
type OutputFieldConfig = {
  id: string; // Unique ID for React key prop
  order: number;
  length?: number; // Required for TXT
  paddingChar?: string; // For TXT
  paddingDirection?: PaddingDirection; // For TXT
  dateFormat?: DateFormat; // For Data type fields
} & (
  | { isStatic: false; mappedField: string } // Mapped field
  | { isStatic: true; fieldName: string; staticValue: string } // Static field
);


type OutputConfig = {
  format: OutputFormat;
  delimiter?: string; // For CSV
  fields: OutputFieldConfig[];
};

// Static Field Dialog State
type StaticFieldDialogState = {
    isOpen: boolean;
    isEditing: boolean;
    fieldId?: string; // ID of the field being edited
    fieldName: string;
    staticValue: string;
    length: string; // Use string for input control
    paddingChar: string;
    paddingDirection: PaddingDirection;
}

// Predefined Field Dialog State
type PredefinedFieldDialogState = {
    isOpen: boolean;
    isEditing: boolean;
    fieldId?: string;
    fieldName: string;
    persist: boolean;
    comment: string; // Add comment state
}


const CORE_PREDEFINED_FIELDS: PredefinedField[] = [
  { id: 'matricula', name: 'Matrícula', isCore: true, comment: 'Número de matrícula do servidor/funcionário.' },
  { id: 'cpf', name: 'CPF', isCore: true, comment: 'Cadastro de Pessoa Física. Será formatado sem máscara na saída se a opção estiver marcada.' },
  { id: 'rg', name: 'RG', isCore: true, comment: 'Registro Geral (Identidade). Pode conter letras e números.' },
  { id: 'nome', name: 'Nome', isCore: true, comment: 'Nome completo.' },
  { id: 'email', name: 'E-mail', isCore: true, comment: 'Endereço de e-mail.' },
  { id: 'cnpj', name: 'CNPJ', isCore: true, comment: 'Cadastro Nacional da Pessoa Jurídica. Será formatado sem máscara na saída se a opção estiver marcada.' },
  { id: 'regime', name: 'Regime', isCore: true, comment: 'Regime de contratação (ex: CLT, Estatutário).' },
  { id: 'situacao', name: 'Situação', isCore: true, comment: 'Situação funcional (ex: Ativo, Inativo).' },
  { id: 'categoria', name: 'Categoria', isCore: true, comment: 'Categoria funcional.' },
  { id: 'secretaria', name: 'Secretaria', isCore: true, comment: 'Secretaria ou órgão de lotação.' },
  { id: 'setor', name: 'Setor', isCore: true, comment: 'Setor ou departamento específico.' },
  { id: 'margem_bruta', name: 'Margem Bruta', isCore: true, comment: 'Valor da margem bruta consignável (Numérico).' },
  { id: 'margem_reservada', name: 'Margem Reservada', isCore: true, comment: 'Valor da margem reservada (Numérico).' },
  { id: 'margem_liquida', name: 'Margem Líquida', isCore: true, comment: 'Valor da margem líquida disponível (Numérico).' },
];

const DATA_TYPES: DataType[] = ['Inteiro', 'Alfanumérico', 'Numérico', 'Data', 'CPF', 'CNPJ']; // Removed 'Texto' and 'Contábil'
const OUTPUT_ENCODINGS: OutputEncoding[] = ['UTF-8', 'ISO-8859-1', 'Windows-1252'];

const NONE_VALUE_PLACEHOLDER = "__NONE__";
const PREDEFINED_FIELDS_STORAGE_KEY = 'sca-predefined-fields'; // LocalStorage key


// Helper to check if a data type is numeric-like
const isNumericType = (dataType: DataType | null): boolean => {
    // Updated to reflect removed types
    return dataType === 'Inteiro' || dataType === 'Numérico' || dataType === 'CPF' || dataType === 'CNPJ';
}

// Helper to get default padding char based on type
const getDefaultPaddingChar = (field: OutputFieldConfig, mappings: ColumnMapping[]): string => {
    if (field.isStatic) {
        // Default to space for static unless value is purely numeric
        return /^-?\d+$/.test(field.staticValue) ? '0' : ' ';
    } else {
        const mapping = mappings.find(m => m.mappedField === field.mappedField);
        // Updated to reflect removed types
        return isNumericType(mapping?.dataType ?? null) ? '0' : ' ';
    }
}

// Helper to get default padding direction based on type
const getDefaultPaddingDirection = (field: OutputFieldConfig, mappings: ColumnMapping[]): PaddingDirection => {
     if (field.isStatic) {
        // Default to left for static if value is purely numeric
        return /^-?\d+$/.test(field.staticValue) ? 'left' : 'right';
    } else {
        const mapping = mappings.find(m => m.mappedField === field.mappedField);
        // Updated to reflect removed types
        return isNumericType(mapping?.dataType ?? null) ? 'left' : 'right';
    }
}

// Helper to format number to specified decimals (handles negatives)
// This helper might need adjustment now that 'Contábil' is removed
const formatNumber = (value: string | number, decimals: number): string => {
    // Remove common currency symbols and thousands separators for parsing
    const cleanedValue = String(value).replace(/[R$., ]/g, (match) => match === '.' ? '.' : ''); // Keep only potential decimal dot
    const num = Number(cleanedValue.replace(',', '.')); // Ensure dot for decimal parsing

    if (isNaN(num)) return '';
    return num.toFixed(decimals);
}

// Helper to remove mask based on type
const removeMaskHelper = (value: string, dataType: DataType | null): string => {
    if (!dataType || value === null || value === undefined) return '';
    const stringValue = String(value);

    switch (dataType) {
        case 'CPF':
        case 'CNPJ':
        case 'Inteiro':
        case 'Numérico':
            return stringValue.replace(/\D/g, ''); // Remove all non-digits
        // Removed 'Contábil' case
        case 'RG':
            // RG can have letters, just remove common separators
            return stringValue.replace(/[.-]/g, '');
        case 'Data':
            return stringValue.replace(/\D/g, ''); // Remove slashes, dashes etc.
        case 'Alfanumérico': // Explicitly handle Alfanumérico (no change)
        default:
            return stringValue;
    }
}

// Download Dialog State
type DownloadDialogState = {
    isOpen: boolean;
    proposedFilename: string;
    finalFilename: string;
}

export default function Home() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileData, setFileData] = useState<any[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [outputConfig, setOutputConfig] = useState<OutputConfig>({ format: 'txt', fields: [] });
  const [predefinedFields, setPredefinedFields] = useState<PredefinedField[]>([]); // Initialized in useEffect
  const [newFieldName, setNewFieldName] = useState<string>('');
  const [convertedData, setConvertedData] = useState<string | Buffer>(''); // Can be string or Buffer
  const [outputEncoding, setOutputEncoding] = useState<OutputEncoding>('UTF-8'); // State for encoding
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingMessage, setProcessingMessage] = useState<string>('Processando...'); // More specific processing message
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [staticFieldDialogState, setStaticFieldDialogState] = useState<StaticFieldDialogState>({
        isOpen: false,
        isEditing: false,
        fieldName: '',
        staticValue: '',
        length: '',
        paddingChar: ' ',
        paddingDirection: 'right',
    });
   const [predefinedFieldDialogState, setPredefinedFieldDialogState] = useState<PredefinedFieldDialogState>({
       isOpen: false,
       isEditing: false,
       fieldName: '',
       persist: false,
       comment: '', // Initialize comment state
   });
    const [downloadDialogState, setDownloadDialogState] = useState<DownloadDialogState>({
        isOpen: false,
        proposedFilename: '',
        finalFilename: '',
    });

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'; // Get version

   // Load predefined fields from localStorage on mount
   useEffect(() => {
       const storedFields = localStorage.getItem(PREDEFINED_FIELDS_STORAGE_KEY);
       let customFields: PredefinedField[] = [];
       if (storedFields) {
           try {
                // Ensure comment is loaded or defaulted
               customFields = JSON.parse(storedFields)
                    .filter((f: any) => typeof f === 'object' && f.id && f.name && !f.isCore)
                    .map((f: any) => ({ ...f, comment: f.comment || '' })); // Ensure comment exists
           } catch (e) {
               console.error("Failed to parse predefined fields from localStorage:", e);
               localStorage.removeItem(PREDEFINED_FIELDS_STORAGE_KEY); // Clear invalid data
           }
       }
       // Combine core fields with loaded custom fields, ensuring no duplicate IDs
       const combined = [...CORE_PREDEFINED_FIELDS.map(f => ({...f, comment: f.comment || ''}))]; // Ensure core fields have comment
       const coreIds = new Set(CORE_PREDEFINED_FIELDS.map(f => f.id));
       customFields.forEach(cf => {
           if (!coreIds.has(cf.id) && !combined.some(f => f.id === cf.id)) {
               combined.push({ ...cf, isCore: false }); // Explicitly mark as not core
           }
       });

       setPredefinedFields(combined);
   }, []);

   // Save custom predefined fields to localStorage when they change
   const saveCustomPredefinedFields = useCallback((fieldsToSave: PredefinedField[]) => {
       const customFields = fieldsToSave.filter(f => !f.isCore);
       try {
           localStorage.setItem(PREDEFINED_FIELDS_STORAGE_KEY, JSON.stringify(customFields));
       } catch (e) {
           console.error("Failed to save predefined fields to localStorage:", e);
           toast({ title: "Erro", description: "Falha ao salvar campos pré-definidos personalizados.", variant: "destructive" });
       }
   }, [toast]);

   // Function to get sample data for preview
   const getSampleData = (): any[] => {
       return fileData.slice(0, 5); // Return first 5 rows
   };


   const resetState = useCallback(() => {
    setFile(null);
    setFileName('');
    setHeaders([]);
    setFileData([]);
    setColumnMappings([]);
    setOutputConfig({ format: 'txt', fields: [] });
    // Don't reset predefined fields (loaded from storage)
    setNewFieldName('');
    setConvertedData('');
    setOutputEncoding('UTF-8'); // Reset encoding
    setIsProcessing(false);
    setProcessingMessage('Processando...');
    setActiveTab("upload");
    setShowPreview(false);
     setStaticFieldDialogState({ isOpen: false, isEditing: false, fieldName: '', staticValue: '', length: '', paddingChar: ' ', paddingDirection: 'right' });
     setPredefinedFieldDialogState({ isOpen: false, isEditing: false, fieldName: '', persist: false, comment: '' }); // Reset predefined dialog state including comment
      setDownloadDialogState({ isOpen: false, proposedFilename: '', finalFilename: '' }); // Reset download dialog state
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
     toast({ title: "Pronto", description: "Formulário resetado para nova conversão." });
  }, [toast]); // Make resetState a useCallback


  // --- File Handling ---
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      const allowedTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.oasis.opendocument.spreadsheet', 'application/pdf'];
      if (!allowedTypes.includes(selectedFile.type)) {
        toast({
          title: "Erro",
          description: "Tipo de arquivo inválido. Por favor, selecione um arquivo XLS, XLSX, ODS ou PDF.",
          variant: "destructive",
        });
        // Don't reset the entire state, just the file selection
        setFile(null);
        setFileName('');
        const fileInput = event.target as HTMLInputElement;
        if(fileInput) fileInput.value = '';
        return;
      }
      // Reset relevant parts of state *before* processing new file
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setHeaders([]);
      setFileData([]);
      setColumnMappings([]);
      setConvertedData('');
      setActiveTab("mapping"); // Move to mapping tab after file select
      processFile(selectedFile); // Process the new file
    }
  };

   // --- Guessing Logic (Moved before processFile) ---
   const guessPredefinedField = useCallback((header: string): string | null => {
      const lowerHeader = header.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Normalize and remove accents
      const guesses: { [key: string]: string[] } = {
          'matricula': ['matricula', 'mat', 'registro', 'id func', 'cod func'],
          'cpf': ['cpf', 'cadastro pessoa fisica'],
          'rg': ['rg', 'identidade', 'registro geral'],
          'nome': ['nome', 'nome completo', 'funcionario', 'colaborador', 'name', 'servidor'],
          'email': ['email', 'e-mail', 'correio eletronico', 'contato'],
          'cnpj': ['cnpj', 'cadastro nacional pessoa juridica'],
          'regime': ['regime', 'tipo regime'],
          'situacao': ['situacao', 'status'],
          'categoria': ['categoria'],
          'secretaria': ['secretaria', 'orgao', 'unidade', 'orgao pagador'], // Added orgao pagador
          'setor': ['setor', 'departamento', 'lotacao'],
          'margem_bruta': ['margem bruta', 'valor bruto', 'bruto', 'salario bruto'],
          'margem_reservada': ['margem reservada', 'reservada', 'valor reservado'],
          'margem_liquida': ['margem liquida', 'liquido', 'valor liquido', 'disponivel', 'margem disponivel'], // Added margem disponivel
      };

      for (const fieldId in guesses) {
          if (guesses[fieldId].some(keyword => lowerHeader.includes(keyword))) {
              return fieldId;
          }
      }
      return null; // No guess
  }, []); // Empty dependency array, this function doesn't depend on component state

 const guessDataType = useCallback((header: string, sampleData: any): DataType | null => {
      const lowerHeader = header.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const stringSample = String(sampleData).trim();

       // Priority based on header keywords
      if (lowerHeader.includes('cnpj')) return 'CNPJ';
      if (lowerHeader.includes('cpf')) return 'CPF';
      if (lowerHeader.includes('data') || lowerHeader.includes('date') || lowerHeader.includes('nasc')) return 'Data';
      // Updated: 'Contábil' removed, use 'Numérico' for currency/margins now
      if (lowerHeader.includes('margem') || lowerHeader.includes('valor') || lowerHeader.includes('salario') || lowerHeader.includes('contabil') || lowerHeader.includes('saldo') || lowerHeader.includes('preco') || lowerHeader.includes('brut') || lowerHeader.includes('liquid') || lowerHeader.includes('reservad')) return 'Numérico';
       if (lowerHeader.includes('matricula') || lowerHeader.includes('mat') || lowerHeader.includes('cod') || lowerHeader.includes('numero') || lowerHeader.includes('num')) return 'Inteiro'; // Prioritize integer for codes/numbers in header
      if (lowerHeader.includes('rg')) return 'Alfanumérico'; // RG often has letters/symbols
       if (lowerHeader.includes('idade') || lowerHeader.includes('quant')) return 'Numérico'; // Could be float or int, but Numérico is safer default
       // Updated: 'Texto' removed, use 'Alfanumérico' for general text
       if (lowerHeader.includes('nome') || lowerHeader.includes('descri') || lowerHeader.includes('texto') || lowerHeader.includes('obs') || lowerHeader.includes('secretaria') || lowerHeader.includes('setor') || lowerHeader.includes('regime') || lowerHeader.includes('situacao') || lowerHeader.includes('categoria') || lowerHeader.includes('email') || lowerHeader.includes('orgao')) return 'Alfanumérico';

      // Guess based on sample data content if header wasn't decisive
       if (stringSample) {
            // Check for date-like patterns (needs refinement for robustness)
            if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(stringSample) || /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(stringSample) || /^\d{6,8}$/.test(stringSample)) return 'Data';
            // Check for CPF/CNPJ-like patterns (basic)
            if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(stringSample)) return 'CPF';
            if (/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(stringSample)) return 'CNPJ';
            // Updated: Check for currency/accounting patterns -> Numérico
            if (/[R$]/.test(stringSample) || /[,.]\d{2}$/.test(stringSample) || /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(stringSample) || /^-?\d+,\d+$/.test(stringSample) ) return 'Numérico';
             // Check if purely integer
            if (/^-?\d+$/.test(stringSample)) return 'Inteiro';
             // Check if potentially numeric (allowing decimal point)
            if (/^-?\d+(\.\d+)?$/.test(stringSample)) return 'Numérico';
        }

      // Default guess - Use Alfanumérico as the broadest default now
       if (/[a-zA-Z]/.test(lowerHeader) || (stringSample && /[a-zA-Z]/.test(stringSample))) return 'Alfanumérico';
       if (/^\d+$/.test(lowerHeader)) return 'Inteiro'; // If header is just digits

      return 'Alfanumérico'; // Ultimate fallback
  }, []); // Empty dependency array


 const processFile = useCallback(async (fileToProcess: File) => {
     if (!fileToProcess) return; // Guard against null file
     setIsProcessing(true);
     setProcessingMessage('Lendo arquivo...');
     // Clear previous data related to file content immediately
     setHeaders([]);
     setFileData([]);
     setColumnMappings([]);
     setConvertedData('');

     let extractedHeaders: string[] = [];
     let extractedData: any[] = [];

     try {
         if (fileToProcess.type.includes('spreadsheet') || fileToProcess.type.includes('excel') || fileToProcess.name.endsWith('.ods')) {
             setProcessingMessage('Processando planilha...');
             const data = await fileToProcess.arrayBuffer();
             const workbook = XLSX.read(data, { type: 'array' });
             const sheetName = workbook.SheetNames[0];
             const worksheet = workbook.Sheets[sheetName];
             const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });

             if (jsonData.length > 0) {
                 extractedHeaders = jsonData[0].map(String);
                 extractedData = jsonData.slice(1).map(row => {
                     const rowData: { [key: string]: any } = {};
                     extractedHeaders.forEach((header, index) => {
                         rowData[header] = row[index] ?? '';
                     });
                     return rowData;
                 });
             }
         } else if (fileToProcess.type === 'application/pdf') {
             setProcessingMessage('Extraindo dados do PDF via IA (pode levar um momento)...');
             toast({
                 title: "Aviso",
                 description: "A extração de PDF usa IA e pode levar mais tempo. A precisão depende do layout do PDF.",
                 variant: "default",
             });

             const pdfReader = new FileReader();
             pdfReader.onload = async (e) => {
                 const pdfDataUri = e.target?.result as string; // Assert type to string
                 if (!pdfDataUri) {
                      toast({ title: "Erro", description: "Falha ao ler o arquivo PDF.", variant: "destructive" });
                      setIsProcessing(false); // Ensure processing stops on read error
                      setActiveTab("upload"); // Go back to upload
                      return; // Stop execution
                 }

                 try {
                     const result: ExtractPdfTableOutput = await extractPdfTable({ pdfDataUri });

                     if (result.error || !result.headers || result.rows.length === 0) {
                         toast({
                             title: "Erro na Extração do PDF",
                             description: result.error || 'Nenhuma tabela encontrada ou erro na IA.',
                             variant: "destructive",
                         });
                         if (!result.headers || result.headers.length === 0) {
                            setActiveTab("upload"); // Go back if completely failed
                            // Keep file name, but clear data
                            setHeaders([]);
                            setFileData([]);
                            setColumnMappings([]);
                         } else {
                             // Headers found, but no rows
                             extractedHeaders = result.headers;
                             extractedData = [];
                             toast({
                                 title: "Aviso",
                                 description: "Cabeçalhos do PDF extraídos, mas nenhuma linha de dados foi retornada pela IA.",
                                 variant: "default",
                             });
                              // Proceed with headers only
                             setHeaders(extractedHeaders);
                             setFileData(extractedData);
                             setColumnMappings(extractedHeaders.map(header => {
                                const guessedField = guessPredefinedField(header);
                                const guessedType = guessDataType(header, ''); // No sample data
                                return {
                                    originalHeader: header,
                                    mappedField: guessedField,
                                    dataType: guessedType,
                                    length: null,
                                    // Updated: Default mask removal for relevant types
                                    removeMask: !!guessedField && ['cpf', 'rg', 'cnpj'].includes(guessedField) || ['Data', 'Numérico', 'Inteiro', 'CPF', 'CNPJ'].includes(guessedType ?? ''),
                                };
                             }));
                             toast({ title: "Sucesso Parcial", description: `Cabeçalhos do PDF ${fileToProcess.name} processados. Nenhuma linha de dados retornada. Verifique o mapeamento.` });
                             setActiveTab("mapping"); // Go to mapping even with no rows
                         }
                     } else {
                         // Successful extraction
                         extractedHeaders = result.headers;
                         extractedData = result.rows.map(row => {
                             const rowData: { [key: string]: any } = {};
                             if (Array.isArray(row)) {
                                 extractedHeaders.forEach((header, index) => {
                                     rowData[header] = row[index] ?? '';
                                 });
                             } else {
                                 extractedHeaders.forEach(header => {
                                     rowData[header] = row[header] ?? '';
                                 });
                             }
                             return rowData;
                         });

                         // Continue processing after PDF handling (inside onload)
                         setHeaders(extractedHeaders);
                         setFileData(extractedData);
                         setColumnMappings(extractedHeaders.map(header => {
                            const guessedField = guessPredefinedField(header);
                            const guessedType = guessDataType(header, extractedData.length > 0 ? extractedData[0][header] : ''); // Pass sample data for better guessing
                            return {
                                originalHeader: header,
                                mappedField: guessedField,
                                dataType: guessedType,
                                length: null,
                                // Updated: Default mask removal for relevant types
                                removeMask: !!guessedField && ['cpf', 'rg', 'cnpj'].includes(guessedField) || ['Data', 'Numérico', 'Inteiro', 'CPF', 'CNPJ'].includes(guessedType ?? ''),
                            }
                         }));
                         toast({ title: "Sucesso", description: `Arquivo PDF ${fileToProcess.name} processado. Verifique o mapeamento.` });
                         setActiveTab("mapping"); // Ensure moving to mapping tab

                     } // End successful PDF extraction else

                 } catch (pdfError: any) {
                     console.error("Erro ao processar PDF via IA:", pdfError);
                     toast({
                         title: "Erro ao Processar PDF",
                         description: pdfError.message || "Ocorreu um erro inesperado durante a extração do PDF.",
                         variant: "destructive",
                     });
                      setActiveTab("upload"); // Go back to upload on error
                      // Keep file name, but clear data
                      setHeaders([]);
                      setFileData([]);
                      setColumnMappings([]);
                 } finally {
                     setIsProcessing(false);
                     setProcessingMessage('Processando...');
                 }
             };
             pdfReader.onerror = (error) => {
                 console.error("Erro ao ler arquivo PDF:", error);
                 toast({
                     title: "Erro ao Ler Arquivo",
                     description: "Não foi possível ler o arquivo PDF.",
                     variant: "destructive",
                 });
                 setActiveTab("upload"); // Go back to upload
                 // Keep file name, clear data
                 setHeaders([]);
                 setFileData([]);
                 setColumnMappings([]);
                 setIsProcessing(false); // Ensure processing stops
             };
             pdfReader.readAsDataURL(fileToProcess);

             // Early return for PDF as processing continues in onload
             return;

         } else {
             throw new Error("Tipo de arquivo não suportado para processamento.");
         }

         // --- Common processing logic for non-PDF ---
         if (extractedHeaders.length === 0 && extractedData.length > 0) {
             // If no headers but data exists, generate default headers
             extractedHeaders = Object.keys(extractedData[0]).map((_, i) => `Coluna ${i + 1}`);
             toast({ title: "Aviso", description: "Cabeçalhos não encontrados, usando 'Coluna 1', 'Coluna 2', etc.", variant: "default" });
         } else if (extractedHeaders.length === 0) {
              throw new Error("Não foi possível extrair cabeçalhos ou dados do arquivo.");
          }


         setHeaders(extractedHeaders);
         setFileData(extractedData);
         setColumnMappings(extractedHeaders.map(header => {
             const guessedField = guessPredefinedField(header);
             const guessedType = guessDataType(header, extractedData.length > 0 ? extractedData[0][header] : ''); // Pass sample data for better guessing
             return {
                 originalHeader: header,
                 mappedField: guessedField,
                 dataType: guessedType,
                 length: null,
                  // Updated: Default mask removal for relevant types
                 removeMask: !!guessedField && ['cpf', 'rg', 'cnpj'].includes(guessedField) || ['Data', 'Numérico', 'Inteiro', 'CPF', 'CNPJ'].includes(guessedType ?? ''),
             }
         }));
         toast({ title: "Sucesso", description: `Arquivo ${fileToProcess.name} processado. Verifique o mapeamento.` });
         setActiveTab("mapping"); // Ensure move to mapping

     } catch (error: any) {
         console.error("Erro ao processar arquivo:", error);
         toast({
             title: "Erro ao Processar Arquivo",
             description: error.message || "Ocorreu um erro inesperado.",
             variant: "destructive",
         });
         setActiveTab("upload"); // Go back to upload on error
         // Keep file name, clear data
         setHeaders([]);
         setFileData([]);
         setColumnMappings([]);
     } finally {
         // Only set processing to false here for non-PDF files
         if (!fileToProcess?.type.includes('pdf')) {
             setIsProcessing(false);
             setProcessingMessage('Processando...'); // Reset message
         }
     }
 }, [toast, guessPredefinedField, guessDataType]);




  // --- Mapping ---
  const handleMappingChange = (index: number, field: keyof ColumnMapping, value: any) => {
    setColumnMappings(prev => {
      const newMappings = [...prev];
      const currentMapping = { ...newMappings[index] };
      let actualValue = value === NONE_VALUE_PLACEHOLDER ? null : value;

      if (field === 'dataType') {
         (currentMapping[field] as any) = actualValue;
         // Updated: Reset length only if not Alfanumeric anymore
         if (actualValue !== 'Alfanumérico') {
           currentMapping.length = null; // Reset length if not text-based
         }
         // Updated: Set default mask removal based on relevant types
         currentMapping.removeMask = ['CPF', 'RG', 'CNPJ', 'Data', 'Numérico', 'Inteiro'].includes(actualValue ?? '');

       } else if (field === 'length') {
           const numValue = parseInt(value, 10);
           currentMapping.length = isNaN(numValue) || numValue <= 0 ? null : numValue;
       } else if (field === 'removeMask') {
           currentMapping.removeMask = Boolean(value); // Ensure boolean
       } else {
          (currentMapping[field] as any) = actualValue;
          // Auto-set data type if mapping to specific types and not already set
            if (field === 'mappedField' && actualValue && !currentMapping.dataType) {
                 const predefined = predefinedFields.find(pf => pf.id === actualValue);
                  // Guess type based on field name AND potentially first row data
                  const sampleData = fileData.length > 0 ? fileData[0][currentMapping.originalHeader] : '';
                 const guessedType = predefined ? guessDataType(predefined.name, sampleData) : guessDataType(currentMapping.originalHeader, sampleData);
                 if(guessedType) currentMapping.dataType = guessedType;

                 // Updated: Default mask removal for relevant types when field is mapped
                 currentMapping.removeMask = ['CPF', 'RG', 'CNPJ', 'Data', 'Numérico', 'Inteiro'].includes(currentMapping.dataType ?? '');
            }
       }

      newMappings[index] = currentMapping;
      return newMappings;
    });
  };



  // --- Predefined Fields ---
   const openAddPredefinedFieldDialog = () => {
        setPredefinedFieldDialogState({
            isOpen: true,
            isEditing: false,
            fieldName: '',
            persist: false, // Default to not persisting
            comment: '', // Reset comment
        });
    };

    const openEditPredefinedFieldDialog = (field: PredefinedField) => {
        setPredefinedFieldDialogState({
            isOpen: true,
            isEditing: true,
            fieldId: field.id,
            fieldName: field.name,
            persist: localStorage.getItem(PREDEFINED_FIELDS_STORAGE_KEY)?.includes(field.id) ?? false, // Check local storage if it's persisted
            comment: field.comment || '', // Load comment
        });
    };

    const handlePredefinedFieldDialogChange = (field: keyof PredefinedFieldDialogState, value: any) => {
         setPredefinedFieldDialogState(prev => ({
             ...prev,
             [field]: value
         }));
     };

   const savePredefinedField = () => {
        const { isEditing, fieldId, fieldName, persist, comment } = predefinedFieldDialogState;
        const trimmedName = fieldName.trim();

        if (!trimmedName) {
            toast({ title: "Erro", description: "Nome do campo não pode ser vazio.", variant: "destructive" });
            return;
        }

         const newId = isEditing ? fieldId! : trimmedName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

          if (!newId) {
             toast({ title: "Erro", description: "Nome do campo inválido para gerar um ID.", variant: "destructive" });
             return;
         }

         // Check for ID collision (only for new fields)
         if (!isEditing && predefinedFields.some(f => f.id === newId)) {
             toast({ title: "Erro", description: `Já existe um campo com o ID gerado "${newId}". Escolha um nome diferente.`, variant: "destructive" });
             return;
         }
         // Check for Name collision (for new and edits, ignoring self)
          if (predefinedFields.some(f => f.name.toLowerCase() === trimmedName.toLowerCase() && f.id !== fieldId)) {
              toast({ title: "Erro", description: `Já existe um campo com o nome "${trimmedName}". Escolha um nome diferente.`, variant: "destructive" });
              return;
          }

          let updatedFields;
          let fieldDescription = `Campo "${trimmedName}"`;

          if (isEditing) {
              const originalField = predefinedFields.find(f => f.id === fieldId);
              // Cannot change core fields to non-persistent or vice-versa, but can edit name/comment
               const canChangePersistence = !originalField?.isCore;

              updatedFields = predefinedFields.map(f =>
                  f.id === fieldId
                      ? { ...f, name: trimmedName, comment: comment || '', isCore: originalField?.isCore ?? false } // Update name and comment, retain isCore
                      : f
              );
              fieldDescription += ' atualizado.';

              if (canChangePersistence) {
                   if (persist) {
                       fieldDescription += ' Será mantido para futuras conversões.';
                   } else {
                       fieldDescription += ' Não será mantido para futuras conversões.';
                   }
               }

          } else {
              const newField: PredefinedField = { id: newId, name: trimmedName, comment: comment || '', isCore: false }; // New fields are never core
              updatedFields = [...predefinedFields, newField];
              fieldDescription += ` adicionado com ID "${newId}".`;
               if (persist) {
                   fieldDescription += ' Será mantido para futuras conversões.';
               } else {
                    fieldDescription += ' Não será mantido para futuras conversões.';
               }
          }

        setPredefinedFields(updatedFields);

        // Update localStorage based on persist flag
        const fieldsToSave = updatedFields.filter(f => !f.isCore); // Get all custom fields
        const currentlyPersisted = persist ? fieldsToSave : fieldsToSave.filter(f => f.id !== newId); // Filter out the current field if unpersisted
        saveCustomPredefinedFields(currentlyPersisted);


        setPredefinedFieldDialogState({ isOpen: false, isEditing: false, fieldName: '', persist: false, comment: '' }); // Close and reset dialog
        toast({ title: "Sucesso", description: fieldDescription });
    };


  const removePredefinedField = (idToRemove: string) => {
    const fieldToRemove = predefinedFields.find(f => f.id === idToRemove);
    if (!fieldToRemove) return;

    if (fieldToRemove.isCore) {
      toast({ title: "Aviso", description: `Não é possível remover o campo pré-definido original "${fieldToRemove.name}".`, variant: "default" });
      return;
    }

     const updatedFields = predefinedFields.filter(f => f.id !== idToRemove);
    setPredefinedFields(updatedFields);

    // Update mappings that used this field
    setColumnMappings(prev => prev.map(m => m.mappedField === idToRemove ? { ...m, mappedField: null } : m));
    // Update output config (remove if it was a mapped field)
    setOutputConfig(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.isStatic || f.mappedField !== idToRemove),
    }));

     // Update localStorage (remove the field if it was persisted)
     const currentlyPersisted = JSON.parse(localStorage.getItem(PREDEFINED_FIELDS_STORAGE_KEY) || '[]') as PredefinedField[];
     saveCustomPredefinedFields(currentlyPersisted.filter(f => f.id !== idToRemove));

    toast({ title: "Sucesso", description: `Campo "${fieldToRemove.name}" removido.` });
  };


  // --- Output Configuration ---
   const handleOutputFormatChange = (value: OutputFormat) => {
      setOutputConfig(prev => {
          const newFields = prev.fields.map(f => ({
              ...f,
              delimiter: value === 'csv' ? (prev.delimiter || '|') : undefined,
              // Reset/update lengths and padding based on the new format
              length: value === 'txt' ? (f.length ?? (f.isStatic ? (f.staticValue?.length || 10) : 10)) : undefined,
              paddingChar: value === 'txt' ? (f.paddingChar ?? getDefaultPaddingChar(f, columnMappings)) : undefined,
              paddingDirection: value === 'txt' ? (f.paddingDirection ?? getDefaultPaddingDirection(f, columnMappings)) : undefined,
          }));
          return {
              ...prev,
              format: value,
              delimiter: value === 'csv' ? (prev.delimiter || '|') : undefined,
              fields: newFields
          };
      });
  };

  const handleDelimiterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setOutputConfig(prev => ({ ...prev, delimiter: event.target.value }));
  };

 const handleOutputFieldChange = (id: string, field: keyof OutputFieldConfig, value: any) => {
    setOutputConfig(prev => {
        const newFields = prev.fields.map(f => {
            if (f.id === id) {
                const updatedField = { ...f };
                let actualValue = value === NONE_VALUE_PLACEHOLDER ? null : value;

                if (field === 'mappedField') {
                    if (!updatedField.isStatic) {
                        updatedField.mappedField = actualValue;
                        const correspondingMapping = columnMappings.find(cm => cm.mappedField === actualValue);
                        const dataType = correspondingMapping?.dataType ?? null;

                        // Update format-specific props and data-type specific props
                        if (prev.format === 'txt') {
                            updatedField.length = updatedField.length ?? (correspondingMapping?.length ?? 10); // Keep existing length if set
                            updatedField.paddingChar = updatedField.paddingChar ?? getDefaultPaddingChar(updatedField, columnMappings);
                            updatedField.paddingDirection = updatedField.paddingDirection ?? getDefaultPaddingDirection(updatedField, columnMappings);
                        } else {
                             // For CSV, clear TXT-specific props if they exist
                             delete updatedField.length;
                             delete updatedField.paddingChar;
                             delete updatedField.paddingDirection;
                        }
                        if (dataType === 'Data') {
                            updatedField.dateFormat = updatedField.dateFormat ?? 'YYYYMMDD'; // Default date format
                        } else {
                            delete updatedField.dateFormat; // Remove if not a date field
                        }
                    }
                } else if (field === 'length') {
                    const numValue = parseInt(value, 10);
                     // Store length even if format isn't TXT, it will be used if format changes back
                    updatedField.length = isNaN(numValue) || numValue <= 0 ? undefined : numValue;
                     // Update padding char/direction if length changes and format is TXT
                     if (prev.format === 'txt') {
                          updatedField.paddingChar = updatedField.paddingChar ?? getDefaultPaddingChar(updatedField, columnMappings);
                          updatedField.paddingDirection = updatedField.paddingDirection ?? getDefaultPaddingDirection(updatedField, columnMappings);
                     }
                } else if (field === 'order') {
                    const numValue = parseInt(value, 10);
                    updatedField.order = isNaN(numValue) ? (prev.fields.length > 0 ? Math.max(...prev.fields.map(f => f.order)) + 1 : 0) : numValue;
                } else if (field === 'paddingChar') {
                    updatedField.paddingChar = String(value).slice(0, 1);
                } else if (field === 'paddingDirection') {
                    updatedField.paddingDirection = value as PaddingDirection;
                } else if (field === 'dateFormat') {
                     updatedField.dateFormat = value as DateFormat;
                }
                // Static field properties handled by dialog
                else {
                    (updatedField as any)[field] = actualValue;
                }
                return updatedField;
            }
            return f;
        });

        // Re-sort fields by order after modification
        newFields.sort((a, b) => a.order - b.order);

        // Re-assign order based on sorted position to ensure sequence
        const reorderedFields = newFields.map((f, idx) => ({ ...f, order: idx }));

        return { ...prev, fields: reorderedFields };
    });
};


  const addOutputField = () => {
    const availableMappedFields = columnMappings
        .filter(m => m.mappedField !== null && !outputConfig.fields.some(of => !of.isStatic && of.mappedField === m.mappedField))
        .map(m => m.mappedField);

    if (availableMappedFields.length === 0) {
        toast({ title: "Aviso", description: "Não há mais campos mapeados disponíveis para adicionar.", variant: "default"});
        return;
    }

    const maxOrder = outputConfig.fields.length > 0 ? Math.max(...outputConfig.fields.map(f => f.order)) : -1;
    const newFieldId = availableMappedFields[0]!;
    const correspondingMapping = columnMappings.find(cm => cm.mappedField === newFieldId);
    const dataType = correspondingMapping?.dataType ?? null;
    // Updated: Use mapping length only for Alfanumeric
    const defaultLength = dataType === 'Alfanumérico' ? correspondingMapping?.length : undefined;

    const newOutputField: OutputFieldConfig = {
        id: `mapped-${newFieldId}-${Date.now()}`, // More unique ID
        isStatic: false,
        mappedField: newFieldId,
        order: maxOrder + 1,
         // Conditionally add TXT props based on current format
        ...(outputConfig.format === 'txt' && {
             length: defaultLength ?? 10,
             paddingChar: getDefaultPaddingChar({isStatic: false, mappedField: newFieldId, id: '', order: 0 }, columnMappings),
             paddingDirection: getDefaultPaddingDirection({isStatic: false, mappedField: newFieldId, id: '', order: 0 }, columnMappings),
         }),
        dateFormat: dataType === 'Data' ? 'YYYYMMDD' : undefined, // Default date format if applicable
    };

    setOutputConfig(prev => ({
        ...prev,
        fields: [...prev.fields, newOutputField].sort((a, b) => a.order - b.order)
    }));
};


  const removeOutputField = (idToRemove: string) => {
     setOutputConfig(prev => {
         const newFields = prev.fields.filter(f => f.id !== idToRemove);
         // Re-assign order after removal
         const reorderedFields = newFields.sort((a, b) => a.order - b.order).map((f, idx) => ({ ...f, order: idx }));
         return {
             ...prev,
             fields: reorderedFields,
         };
     });
   };

 // --- Static Field Handling ---
    const openAddStaticFieldDialog = () => {
        setStaticFieldDialogState({
            isOpen: true,
            isEditing: false,
            fieldName: '',
            staticValue: '',
            length: '',
            paddingChar: ' ',
            paddingDirection: 'right',
        });
    };

    const openEditStaticFieldDialog = (field: OutputFieldConfig) => {
        if (!field.isStatic) return; // Should not happen
        setStaticFieldDialogState({
            isOpen: true,
            isEditing: true,
            fieldId: field.id,
            fieldName: field.fieldName,
            staticValue: field.staticValue,
            length: String(field.length ?? ''), // Use string for input
            paddingChar: field.paddingChar ?? getDefaultPaddingChar(field, columnMappings),
            paddingDirection: field.paddingDirection ?? getDefaultPaddingDirection(field, columnMappings),
        });
    };

    const handleStaticFieldDialogChange = (field: keyof StaticFieldDialogState, value: any) => {
        setStaticFieldDialogState(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const saveStaticField = () => {
        const { isEditing, fieldId, fieldName, staticValue, length, paddingChar, paddingDirection } = staticFieldDialogState;
        const len = parseInt(length, 10);

        if (!fieldName.trim()) {
            toast({ title: "Erro", description: "Nome do Campo Estático não pode ser vazio.", variant: "destructive" });
            return;
        }
        if (outputConfig.format === 'txt' && (isNaN(len) || len <= 0)) {
            toast({ title: "Erro", description: "Tamanho deve ser um número positivo para formato TXT.", variant: "destructive" });
            return;
        }
         if (outputConfig.format === 'txt' && (!paddingChar || paddingChar.length !== 1)) {
            toast({ title: "Erro", description: "Caractere de Preenchimento deve ser um único caractere para TXT.", variant: "destructive" });
            return;
        }


        const staticField: OutputFieldConfig = {
             id: isEditing && fieldId ? fieldId : `static-${Date.now()}`, // Use existing ID if editing
             isStatic: true,
             fieldName: fieldName.trim(),
             staticValue: staticValue,
             order: 0, // Will be re-ordered later
              // Conditionally add TXT props based on current format
             ...(outputConfig.format === 'txt' && {
                length: len,
                paddingChar: paddingChar,
                paddingDirection: paddingDirection,
            }),
              // Cannot have dateFormat for static fields
         };


        setOutputConfig(prev => {
            let newFields;
            if (isEditing) {
                // Find existing field and update, keep original order for now
                 const existingFieldIndex = prev.fields.findIndex(f => f.id === fieldId);
                 if (existingFieldIndex === -1) return prev; // Should not happen
                 newFields = [...prev.fields];
                 // Ensure TXT props are updated based on the DIALOG state, not just the current format
                  const updatedStaticField = { ...staticField, order: prev.fields[existingFieldIndex].order }; // Preserve order
                  if (prev.format === 'txt') {
                     updatedStaticField.length = len;
                     updatedStaticField.paddingChar = paddingChar;
                     updatedStaticField.paddingDirection = paddingDirection;
                  } else {
                      // Keep the values from the dialog even if format is CSV, they'll be used if switching back
                      updatedStaticField.length = len; // Store it
                      updatedStaticField.paddingChar = paddingChar; // Store it
                      updatedStaticField.paddingDirection = paddingDirection; // Store it
                      // ... but they won't be applied during CSV generation
                  }

                 newFields[existingFieldIndex] = updatedStaticField;

            } else {
                 // Add new field to the end for now
                 const maxOrder = prev.fields.length > 0 ? Math.max(...prev.fields.map(f => f.order)) : -1;
                 staticField.order = maxOrder + 1;
                 newFields = [...prev.fields, staticField];
            }
            // Re-sort and re-order all fields
             newFields.sort((a, b) => a.order - b.order);
             const reorderedFields = newFields.map((f, idx) => ({ ...f, order: idx }));

            return { ...prev, fields: reorderedFields };
        });

        setStaticFieldDialogState({ ...staticFieldDialogState, isOpen: false }); // Close dialog
        toast({ title: "Sucesso", description: `Campo estático "${fieldName.trim()}" ${isEditing ? 'atualizado' : 'adicionado'}.` });
    };


 // Effect to initialize/update output fields based on mapped fields and format changes
   useEffect(() => {
       // Only run if mappings or file data exist
       if (columnMappings.length === 0 && fileData.length === 0) return;

       setOutputConfig(prevConfig => {
           const existingFieldsMap = new Map(prevConfig.fields.map(f => [f.isStatic ? f.id : f.mappedField, f])); // Use mappedField or ID as key

           // Generate potential fields from current mappings
           const potentialMappedFields = columnMappings
               .filter(m => m.mappedField !== null)
               .map((m, index) => {
                   const dataType = m.dataType ?? null;
                   const fieldId = `mapped-${m.mappedField!}-${index}`; // Consistent ID generation
                   const existingField = existingFieldsMap.get(m.mappedField!) as OutputFieldConfig | undefined;

                   // Updated: Length from mapping relevant only for Alfanumeric
                    let baseField: Omit<OutputFieldConfig, 'id' | 'order' | 'isStatic' | 'mappedField'> & { mappedField: string, isStatic: false } = {
                       isStatic: false,
                       mappedField: m.mappedField!,
                        // Preserve existing values if they exist, otherwise set based on mapping/defaults
                       length: existingField?.length ?? (dataType === 'Alfanumérico' ? (m.length ?? undefined) : undefined), // Length only for Alfanum from mapping
                       paddingChar: existingField?.paddingChar ?? undefined,
                       paddingDirection: existingField?.paddingDirection ?? undefined,
                       dateFormat: existingField?.dateFormat ?? (dataType === 'Data' ? 'YYYYMMDD' : undefined),
                    };

                   // Apply format-specific overrides ONLY if not already set from existingField
                   if (prevConfig.format === 'txt') {
                        baseField.length = baseField.length ?? 10; // Ensure length for TXT (default 10 if not Alfanum/existing)
                        baseField.paddingChar = baseField.paddingChar ?? getDefaultPaddingChar(baseField, columnMappings);
                        baseField.paddingDirection = baseField.paddingDirection ?? getDefaultPaddingDirection(baseField, columnMappings);
                   } else {
                       // Remove TXT-specific props if format is CSV *and* they weren't preserved from an existing field
                       if (existingField?.length === undefined) delete baseField.length;
                       if (existingField?.paddingChar === undefined) delete baseField.paddingChar;
                       if (existingField?.paddingDirection === undefined) delete baseField.paddingDirection;
                   }
                     // Ensure dateFormat is only present for Data type, unless preserved
                    if (dataType !== 'Data' && existingField?.dateFormat === undefined) {
                       delete baseField.dateFormat;
                    } else if (dataType === 'Data') {
                        baseField.dateFormat = baseField.dateFormat ?? 'YYYYMMDD'; // Ensure default if Data type
                    }


                   return {
                        ...baseField,
                        id: existingField?.id ?? fieldId, // Use existing ID if available
                        order: existingField?.order ?? (prevConfig.fields.length + index) // Preserve order or append
                   };
               });


           // Filter out duplicate mapped fields, keeping the one with the lowest original order (or first occurrence)
           const uniqueMappedFields = potentialMappedFields.reduce((acc, current) => {
               const existingIndex = acc.findIndex(item => !item.isStatic && item.mappedField === current.mappedField);
                if (existingIndex === -1) {
                   acc.push(current);
               } else if (current.order < acc[existingIndex].order) {
                    // Replace if the current one has a lower original order
                    acc[existingIndex] = current;
               }
               return acc;
           }, [] as (OutputFieldConfig & {isStatic: false})[]); // Assert type here

           // Get existing static fields, update TXT props based on current format
            const updatedStaticFields = prevConfig.fields
                .filter((f): f is OutputFieldConfig & { isStatic: true } => f.isStatic) // Type guard
                .map(f => {
                    if (prevConfig.format === 'txt') {
                        return {
                            ...f,
                            length: f.length ?? f.staticValue?.length ?? 10, // Ensure length for static in TXT
                            paddingChar: f.paddingChar ?? getDefaultPaddingChar(f, columnMappings),
                            paddingDirection: f.paddingDirection ?? getDefaultPaddingDirection(f, columnMappings),
                        };
                    } else {
                        // Keep stored values but don't apply them if format is CSV
                         return {
                             ...f,
                             // length, paddingChar, paddingDirection are kept but not used by CSV logic
                         };
                    }
                });


           // Combine existing static fields with new/updated unique mapped fields
            let combinedFields: OutputFieldConfig[] = [ // Ensure combinedFields has the correct type
               ...updatedStaticFields,
               ...uniqueMappedFields
           ];

           // Filter out mapped fields that are no longer in columnMappings
            combinedFields = combinedFields.filter(field =>
               field.isStatic || columnMappings.some(cm => cm.mappedField === field.mappedField)
           );


           // Sort and re-order
           combinedFields.sort((a, b) => a.order - b.order);
           const reorderedFinalFields = combinedFields.map((f, idx) => ({ ...f, order: idx }));


           // Check if fields actually changed to prevent infinite loop
            const hasChanged = JSON.stringify(prevConfig.fields) !== JSON.stringify(reorderedFinalFields);

           if (hasChanged) {
               // console.log("Updating output config fields:", reorderedFinalFields); // Keep for debugging if needed
               return {
                   ...prevConfig,
                   fields: reorderedFinalFields
               };
           } else {
               return prevConfig; // No change
           }
       });
   }, [columnMappings, fileData, outputConfig.format]); // Simplified dependencies


  // --- Conversion ---
  const convertFile = () => {
    setIsProcessing(true);
    setProcessingMessage('Convertendo arquivo...');
    setConvertedData(''); // Clear previous results

    if (!fileData && outputConfig.fields.every(f => f.isStatic === false)) { // Allow conversion if only static fields exist, even with empty fileData
        toast({ title: "Erro", description: "Nenhum dado de entrada ou campo mapeado para converter.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
     if (outputConfig.fields.length === 0) {
         toast({ title: "Erro", description: "Configure os campos de saída antes de converter.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    // Validate mappings and output config
    const mappedOutputFields = outputConfig.fields.filter(f => !f.isStatic);
    const requiredMappings = columnMappings.filter(m => mappedOutputFields.some(f => !f.isStatic && f.mappedField === m.mappedField)); // Filter non-static

    // Allow skipping data type validation if the field isn't actually used in the output
    const usedMappedFields = new Set(mappedOutputFields.map(f => f.mappedField));
    const mappingsUsedInOutput = columnMappings.filter(m => m.mappedField && usedMappedFields.has(m.mappedField));

    if (mappingsUsedInOutput.some(m => !m.dataType)) {
        toast({ title: "Erro", description: "Defina o 'Tipo' para todos os campos mapeados usados na saída.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
     if (outputConfig.format === 'txt' && outputConfig.fields.some(f => (f.length === undefined || f.length === null || f.length <= 0) )) {
        toast({ title: "Erro", description: "Defina um 'Tamanho' válido (> 0) para todos os campos na saída TXT.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
      if (outputConfig.format === 'txt' && outputConfig.fields.some(f => !f.paddingChar || f.paddingChar.length !== 1)) {
         toast({ title: "Erro", description: "Defina um 'Caractere de Preenchimento' válido (1 caractere) para todos os campos na saída TXT.", variant: "destructive" });
         setIsProcessing(false);
         return;
     }
     if (outputConfig.format === 'csv' && (!outputConfig.delimiter || outputConfig.delimiter.length === 0)) {
        toast({ title: "Erro", description: "Defina um 'Delimitador' para a saída CSV.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
    // Validate date fields have dateFormat selected
    if (outputConfig.fields.some(f => !f.isStatic && columnMappings.find(cm => cm.mappedField === f.mappedField)?.dataType === 'Data' && !f.dateFormat)) {
        toast({ title: "Erro", description: "Selecione um 'Formato Data' para todos os campos do tipo Data na saída.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }


    try {
      let resultString = '';
      const sortedOutputFields = [...outputConfig.fields].sort((a, b) => a.order - b.order);

      // Handle case where fileData might be empty (e.g., PDF headers only or only static fields)
      const dataToProcess = fileData && fileData.length > 0 ? fileData : [{}]; // Process at least once for static fields

      dataToProcess.forEach(row => {
        let line = '';
        sortedOutputFields.forEach((outputField, fieldIndex) => {
          let value = '';
          let mapping: ColumnMapping | undefined;
          let dataType: DataType | null = null;
          let originalValue: any = null; // Store original value before processing

          if (outputField.isStatic) {
             value = outputField.staticValue ?? '';
             originalValue = value;
             // Treat static numeric strings for padding purposes
             dataType = /^-?\d+([.,]\d+)?$/.test(value) ? 'Numérico' : 'Alfanumérico'; // Use Alfanumérico as default text type
          } else {
             mapping = columnMappings.find(m => m.mappedField === outputField.mappedField);
             if (!mapping || !mapping.originalHeader || !fileData || fileData.length === 0) { // Check if fileData exists and is not empty
                 if(fileData && fileData.length > 0) console.warn(`Mapeamento não encontrado para o campo de saída: ${outputField.mappedField}`);
                 value = ''; // Default to empty string if mapping missing or no data rows
             } else {
                 originalValue = row[mapping.originalHeader] ?? ''; // Get original value
                 value = String(originalValue).trim(); // Work with the string representation, trim
                 dataType = mapping.dataType; // Get data type from mapping

                 // Apply mask removal if configured
                  if (mapping.removeMask && dataType && value) { // Check if value is truthy before removing mask
                      value = removeMaskHelper(value, dataType);
                  }


                 // Apply formatting/validation based on dataType (AFTER mask removal if applicable)
                 switch (dataType) {
                      case 'CPF':
                      case 'CNPJ':
                      case 'Inteiro':
                           // Value should already be digits only if mask was removed
                            if (!mapping.removeMask && value) value = value.replace(/\D/g, ''); // Ensure only digits if mask wasn't removed
                           break;
                      case 'Numérico':
                           // Handle different numeric inputs (0, 130, 179.1, -350) -> format to "0.00", "130.00", "179.10", "-350.00"
                            // Value after mask removal should be like "179.1" or "-350" or "0" or "-123.45"
                            const numStr = value.replace(',', '.'); // Ensure dot as decimal sep
                            const numMatch = numStr.match(/^(-?\d+\.?\d*)|(^-?\.\d+)/); // Match number, allow leading/trailing dot, handle negative and starting with dot

                            if (numMatch && numMatch[0]) {
                                let numVal = parseFloat(numMatch[0]);
                                if (isNaN(numVal)) {
                                    value = '0.00'; // Default to 0.00 if parsing fails
                                } else {
                                    value = numVal.toFixed(2); // Format to 2 decimal places
                                }
                            } else if (value === '0' || value === '') { // Handle empty string as 0.00 too
                                value = '0.00'; // Explicitly handle "0" or empty
                            }
                             else {
                                 console.warn(`Could not parse numeric value: ${originalValue} (processed: ${value}). Defaulting to 0.00`);
                                value = '0.00'; // Default if no valid number found
                            }
                          break;
                       // Removed 'Contábil' case
                       case 'Data':
                            try {
                                let parsedDate: Date | null = null;
                                let cleanedValue = value; // Use value after potential mask removal

                                // If mask wasn't removed, try to clean common date separators
                                if (!mapping?.removeMask && value) {
                                    cleanedValue = value.replace(/[^\d]/g, ''); // Basic cleaning, remove non-digits
                                }

                                // Attempt parsing based on cleaned length or common formats from original value
                                let year = '', month = '', day = '';

                                if (cleanedValue.length === 8) { // Assume YYYYMMDD, DDMMYYYY, or MMDDYYYY from cleaned value
                                    const part1 = cleanedValue.substring(0, 2);
                                    const part2 = cleanedValue.substring(2, 4);
                                    const part3 = cleanedValue.substring(4, 8);
                                    const part4 = cleanedValue.substring(0, 4);
                                    const part5 = cleanedValue.substring(4, 6);
                                    const part6 = cleanedValue.substring(6, 8);

                                    // Check YYYYMMDD
                                    if (parseInt(part4) > 1900 && parseInt(part4) < 2100 && parseInt(part5) >= 1 && parseInt(part5) <= 12 && parseInt(part6) >= 1 && parseInt(part6) <= 31) {
                                        year = part4; month = part5; day = part6;
                                    }
                                    // Check DDMMYYYY
                                    else if (parseInt(part1) >= 1 && parseInt(part1) <= 31 && parseInt(part2) >= 1 && parseInt(part2) <= 12 && parseInt(part3) > 1900 && parseInt(part3) < 2100) {
                                        day = part1; month = part2; year = part3;
                                    }
                                     // Check MMDDYYYY (less common in Brazil, but possible)
                                     else if (parseInt(part1) >= 1 && parseInt(part1) <= 12 && parseInt(part2) >= 1 && parseInt(part2) <= 31 && parseInt(part3) > 1900 && parseInt(part3) < 2100) {
                                          month = part1; day = part2; year = part3;
                                     }
                                } else if (cleanedValue.length === 6) { // Assume DDMMYY, YYMMDD, MMDDYY
                                    const part1 = cleanedValue.substring(0, 2);
                                    const part2 = cleanedValue.substring(2, 4);
                                    const part3 = cleanedValue.substring(4, 6);
                                     // Assume DDMMYY first
                                     if(parseInt(part1) >= 1 && parseInt(part1) <= 31 && parseInt(part2) >= 1 && parseInt(part2) <= 12) {
                                         day = part1; month = part2; year = part3;
                                     }
                                     // Could add more heuristics for YYMMDD etc. if needed
                                      if (year.length === 2) {
                                        year = (parseInt(year) < 70 ? '20' : '19') + year; // Basic year completion
                                      }
                                }

                                 // Try parsing original value with common separators if cleaned value didn't work well
                                 if (!year && originalValue) {
                                     const dateString = String(originalValue).trim();
                                     const datePartsSlash = dateString.split('/');
                                     const datePartsDash = dateString.split('-');

                                     if (datePartsSlash.length === 3) {
                                         if (datePartsSlash[2].length === 4) { // DD/MM/YYYY
                                             day = datePartsSlash[0]; month = datePartsSlash[1]; year = datePartsSlash[2];
                                         } else if (datePartsSlash[0].length === 4) { // YYYY/MM/DD
                                             year = datePartsSlash[0]; month = datePartsSlash[1]; day = datePartsSlash[2];
                                         } else if (datePartsSlash[2].length === 2) { // DD/MM/YY
                                             day = datePartsSlash[0]; month = datePartsSlash[1]; year = datePartsSlash[2];
                                              if(year.length === 2) year = (parseInt(year) < 70 ? '20' : '19') + year;
                                         }
                                     } else if (datePartsDash.length === 3) {
                                         if (datePartsDash[0].length === 4) { // YYYY-MM-DD
                                             year = datePartsDash[0]; month = datePartsDash[1]; day = datePartsDash[2];
                                         } else if (datePartsDash[2].length === 4) { // DD-MM-YYYY
                                             day = datePartsDash[0]; month = datePartsDash[1]; year = datePartsDash[2];
                                         } else if (datePartsDash[2].length === 2) { // DD-MM-YY
                                             day = datePartsDash[0]; month = datePartsDash[1]; year = datePartsDash[2];
                                             if(year.length === 2) year = (parseInt(year) < 70 ? '20' : '19') + year;
                                         }
                                     }
                                 }


                                // Construct Date object if parts found
                                if (year && month && day && parseInt(year) > 0 && parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
                                     // Basic validation passed, try constructing
                                    const paddedMonth = month.padStart(2, '0');
                                    const paddedDay = day.padStart(2, '0');
                                    // Use UTC to avoid timezone issues if date is just YMD
                                    // Note: Month is 0-indexed in JS Date constructor
                                    parsedDate = new Date(Date.UTC(parseInt(year), parseInt(paddedMonth) - 1, parseInt(paddedDay)));

                                    // Validate parsed date parts against input parts to catch invalid dates like 31/04/2023
                                     // Need to check UTC methods here
                                    if (!parsedDate || isNaN(parsedDate.getTime()) || parsedDate.getUTCFullYear() !== parseInt(year) || (parsedDate.getUTCMonth() + 1) !== parseInt(paddedMonth) || parsedDate.getUTCDate() !== parseInt(paddedDay) ) {
                                         parsedDate = null; // Invalid date resulted from parts
                                         if (year && month && day) console.warn(`Date validation failed for parts: D=${day}, M=${month}, Y=${year}`);
                                    }
                                } else if (year || month || day) {
                                     // If some parts were found but they were invalid (e.g., month 13)
                                     console.warn(`Invalid date parts extracted: D=${day}, M=${month}, Y=${year}`);
                                }


                                // Fallback: Try standard Date constructor on original value as last resort
                                if ((!parsedDate || isNaN(parsedDate.getTime())) && originalValue) {
                                     // Only attempt if originalValue looks somewhat like a date
                                    if (String(originalValue).trim() && /[0-9]/.test(String(originalValue))) {
                                        let attemptOriginalParse = new Date(originalValue);
                                        // Check if the fallback parse is valid and not the epoch date (often indicates failure)
                                         // Also check if year is reasonable
                                         if (attemptOriginalParse && !isNaN(attemptOriginalParse.getTime()) && attemptOriginalParse.getFullYear() > 1000 && attemptOriginalParse.getFullYear() < 3000) {
                                            parsedDate = attemptOriginalParse; // Use local time if parsed this way
                                            console.log("Date parsed using fallback:", parsedDate);
                                        } else {
                                             console.warn(`Fallback date parsing failed or resulted in invalid date for: ${originalValue}`);
                                        }
                                    }
                                }


                                // Format output if valid date found
                                if (parsedDate && !isNaN(parsedDate.getTime())) {
                                    // Use local date parts if parsed by fallback, otherwise UTC
                                     const useUTC = parsedDate.getUTCHours() === 0 && parsedDate.getUTCMinutes() === 0; // Heuristic: check if it was likely built with UTC
                                     const y = useUTC ? parsedDate.getUTCFullYear() : parsedDate.getFullYear();
                                     const m = String((useUTC ? parsedDate.getUTCMonth() : parsedDate.getMonth()) + 1).padStart(2, '0');
                                     const d = String(useUTC ? parsedDate.getUTCDate() : parsedDate.getDate()).padStart(2, '0');

                                    const dateFormat = outputField.dateFormat || 'YYYYMMDD'; // Use configured format

                                     value = dateFormat === 'YYYYMMDD' ? `${y}${m}${d}` : `${d}${m}${y}`;
                                } else if (value) { // Only warn if we failed and it wasn't originally empty
                                    console.warn(`Could not parse date: ${originalValue} (cleaned: ${cleanedValue}). Outputting empty.`);
                                    value = ''; // Set to empty if all parsing fails
                                } else {
                                    value = ''; // Ensure empty if original value was also empty/null
                                }

                            } catch (e) {
                                console.error(`Error processing date: ${originalValue}`, e);
                                value = '';
                            }
                            break;
                      case 'Alfanumérico': // Updated: Replaced 'Texto'
                      default:
                          // Value is already trimmed string, potentially with mask removed
                          break;
                 }
             }
          }


          // --- Apply Output Formatting (TXT Padding or CSV Delimiting) ---
          if (outputConfig.format === 'txt') {
             const len = outputField.length ?? 0; // Default to 0 if somehow undefined
             const padChar = outputField.paddingChar || getDefaultPaddingChar(outputField, columnMappings); // Use default if missing
             const padDir = outputField.paddingDirection || getDefaultPaddingDirection(outputField, columnMappings); // Use default if missing
             let processedValue = String(value ?? ''); // Ensure string, handle null/undefined as empty

              // Handle TXT padding/truncating for all types, including negative numbers
             if (len > 0) {
                 if (processedValue.length > len) {
                      console.warn(`Truncating value "${processedValue}" for field ${outputField.isStatic ? outputField.fieldName : outputField.mappedField} as it exceeds length ${len}`);
                      // Truncate based on padding direction (or a sensible default)
                       // Keep sign if numeric and padding left
                      if (padDir === 'left' && (dataType === 'Numérico' || dataType === 'Inteiro' || (outputField.isStatic && /^-?\d/.test(processedValue)))) { // Updated types
                          const isNegative = processedValue.startsWith('-');
                          const absValue = isNegative ? processedValue.substring(1) : processedValue;
                           const targetLength = isNegative ? len - 1 : len; // Leave space for sign if needed

                           if (targetLength <= 0) {
                               processedValue = isNegative ? '-' : ''; // Only keep sign if len=1 and negative, else empty
                               if (processedValue.length > len) processedValue = processedValue.substring(0, len); // Ensure length constraint
                           } else {
                               // When truncating numbers padded left, take the rightmost part
                               const truncatedAbs = absValue.substring(absValue.length - targetLength);
                               processedValue = isNegative ? '-' + truncatedAbs : truncatedAbs;
                           }

                      } else {
                         // For right padding or non-numeric left padding, take leftmost part
                         processedValue = processedValue.substring(0, len);
                      }

                 } else if (processedValue.length < len) {
                     const padLen = len - processedValue.length;
                     if (padDir === 'left') {
                         // Special handling for negative numbers when padding left with '0'
                         if (processedValue.startsWith('-') && padChar === '0') {
                             processedValue = '-' + padChar.repeat(padLen) + processedValue.substring(1);
                         } else {
                             processedValue = padChar.repeat(padLen) + processedValue;
                         }
                     } else { // right
                         processedValue = processedValue + padChar.repeat(padLen);
                     }
                 }
                 // Ensure final length is correct, especially after negative sign handling
                  if (processedValue.length > len) {
                      // This might happen if padding logic for negative numbers was slightly off
                       console.warn(`Re-truncating value "${processedValue}" to length ${len} after padding`);
                       if (padDir === 'left') {
                           processedValue = processedValue.slice(-len); // Keep rightmost for left padding
                       } else {
                            processedValue = processedValue.slice(0, len); // Keep leftmost for right padding
                       }

                  } else if (processedValue.length < len && padDir === 'left') {
                       // This might happen if initial padding was insufficient
                       processedValue = padChar.repeat(len - processedValue.length) + processedValue;
                  }


             } else {
                 processedValue = ''; // If length is 0, output empty string for positional
             }


             line += processedValue;

          } else if (outputConfig.format === 'csv') {
            if (fieldIndex > 0) {
              line += outputConfig.delimiter;
            }
             // Basic CSV escaping
             let csvValue = String(value ?? ''); // Ensure string
             // Handle numeric types that should use dot as decimal separator in CSV
              if (dataType === 'Numérico') {
                   // Value should already be 'XXX.YY' from processing step, replace dot with comma for Brazilian CSV standard?
                    csvValue = csvValue.replace('.', ','); // Optional: If comma is desired decimal separator in CSV
              }
              // Removed 'Contábil' specific handling

             const needsQuotes = csvValue.includes(outputConfig.delimiter!) || csvValue.includes('"') || csvValue.includes('\n');
             if (needsQuotes) {
                csvValue = `"${csvValue.replace(/"/g, '""')}"`;
            }
            line += csvValue;
          }
        });
        resultString += line + '\n';
      });

       // Encode the result string to the selected encoding
        const resultBuffer = iconv.encode(resultString.trimEnd(), outputEncoding);
        setConvertedData(resultBuffer); // Store as Buffer

      setActiveTab("result");
      toast({ title: "Sucesso", description: "Arquivo convertido com sucesso!" });
    } catch (error: any) {
      console.error("Erro na conversão:", error);
      toast({
        title: "Erro na Conversão",
        description: error.message || "Ocorreu um erro inesperado durante a conversão.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProcessingMessage('Processando...'); // Reset message
    }
  };

   const openDownloadDialog = () => {
        if (!convertedData) return;
        const proposed = `${fileName.split('.').slice(0, -1).join('.')}_convertido.${outputConfig.format}`;
        setDownloadDialogState({
            isOpen: true,
            proposedFilename: proposed,
            finalFilename: proposed, // Default to proposed
        });
    };

    const handleDownloadFilenameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
         setDownloadDialogState(prev => ({
             ...prev,
             finalFilename: event.target.value,
         }));
     };


   const confirmDownload = () => {
        const { finalFilename } = downloadDialogState;
        if (!convertedData || !finalFilename) return;

        const mimeType = outputConfig.format === 'txt'
            ? `text/plain;charset=${outputEncoding.toLowerCase()}`
            : `text/csv;charset=${outputEncoding.toLowerCase()}`;

         // Create Blob from Buffer or string
         const blob = convertedData instanceof Buffer
             ? new Blob([convertedData], { type: mimeType })
             : new Blob([String(convertedData)], { type: mimeType }); // Ensure string for Blob constructor

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename.endsWith(`.${outputConfig.format}`) ? finalFilename : `${finalFilename}.${outputConfig.format}`; // Ensure correct extension
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: "Download Iniciado", description: `Arquivo ${link.download} sendo baixado.`});
        setDownloadDialogState({ isOpen: false, proposedFilename: '', finalFilename: '' }); // Close dialog
    };

  // Memoized list of predefined fields available for mapping dropdowns
  const memoizedPredefinedFields = useMemo(() => {
      return predefinedFields.sort((a, b) => a.name.localeCompare(b.name));
  }, [predefinedFields]);


 // Render helper for Output Field selection for MAPPED fields
 const renderMappedOutputFieldSelect = (currentField: OutputFieldConfig) => {
     if (currentField.isStatic) return null; // Only for mapped fields

     const currentFieldMappedId = currentField.mappedField;
      // Options: Current field + fields mapped in input + not yet used in output
     const availableOptions = memoizedPredefinedFields // Use memoized list
         .filter(pf =>
             columnMappings.some(cm => cm.mappedField === pf.id) // Must be mapped in input
         )
         .filter(pf =>
              pf.id === currentFieldMappedId || // Allow current selection
              !outputConfig.fields.some(of => !of.isStatic && of.mappedField === pf.id) // Allow if not already used by another mapped field
          );


     return (
         <Select
             value={currentFieldMappedId || NONE_VALUE_PLACEHOLDER}
             onValueChange={(value) => handleOutputFieldChange(currentField.id, 'mappedField', value)}
             disabled={isProcessing}
         >
             <SelectTrigger className="w-full text-xs h-8">
                 <SelectValue placeholder="Selecione o Campo" />
             </SelectTrigger>
             <SelectContent>
                 <SelectItem value={NONE_VALUE_PLACEHOLDER} disabled>-- Selecione --</SelectItem>
                 {availableOptions.length > 0 ? (
                     availableOptions.map(field => (
                         <SelectItem key={field.id} value={field.id}>
                             {field.name}
                         </SelectItem>
                     ))
                 ) : (
                      <SelectItem value={NONE_VALUE_PLACEHOLDER} disabled>Nenhum campo mapeado</SelectItem> // Use placeholder value
                 )}
             </SelectContent>
         </Select>
     );
 };

 // --- Render ---
  return (
    <div className="container mx-auto p-4 md:p-8 flex flex-col items-center min-h-screen bg-background">
      <Card className="w-full max-w-5xl shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-foreground">
            <Columns className="inline-block mr-2 text-accent" /> SCA - Sistema para conversão de arquivos
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Converta seus arquivos Excel ou PDF(em teste) para layouts TXT ou CSV personalizados.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
             <TabsList className="grid w-full grid-cols-4 mb-6">
                  {/* Apply custom active style using data-state */}
                 <TabsTrigger value="upload" disabled={isProcessing} data-state={activeTab === 'upload' ? 'active' : 'inactive'} className={activeTab === 'upload' ? 'tabs-trigger-active' : ''}>1. Upload</TabsTrigger>
                 <TabsTrigger value="mapping" disabled={isProcessing || !file} data-state={activeTab === 'mapping' ? 'active' : 'inactive'} className={activeTab === 'mapping' ? 'tabs-trigger-active' : ''}>2. Mapeamento</TabsTrigger>
                 <TabsTrigger value="config" disabled={isProcessing || !file } data-state={activeTab === 'config' ? 'active' : 'inactive'} className={activeTab === 'config' ? 'tabs-trigger-active' : ''}>3. Configurar Saída</TabsTrigger>
                 <TabsTrigger value="result" disabled={isProcessing || !convertedData} data-state={activeTab === 'result' ? 'active' : 'inactive'} className={activeTab === 'result' ? 'tabs-trigger-active' : ''}>4. Resultado</TabsTrigger>
             </TabsList>

            {/* 1. Upload Tab */}
            <TabsContent value="upload">
              <div className="flex flex-col items-center space-y-6 p-6 border rounded-lg bg-card">
                  <Label htmlFor="file-upload" className="text-lg font-semibold text-foreground cursor-pointer hover:text-accent transition-colors">
                     <Button asChild variant="default" className="bg-accent hover:bg-accent/90 text-accent-foreground cursor-pointer">
                          <span>
                              <Upload className="mr-2 h-5 w-5 inline-block" />
                               Selecione o Arquivo para Conversão
                          </span>
                     </Button>
                     <Input
                        id="file-upload"
                        type="file"
                        accept=".xls,.xlsx,.ods,.pdf"
                        onChange={handleFileChange}
                        className="hidden" // Hide the default input appearance
                        disabled={isProcessing}
                     />
                 </Label>

                <p className="text-sm text-muted-foreground">Formatos suportados: XLS, XLSX, ODS, PDF(em teste)</p>

                {fileName && (
                  <div className="mt-4 text-center text-sm text-muted-foreground">
                    Arquivo selecionado: <span className="font-medium text-foreground">{fileName}</span>
                  </div>
                )}
                 {isProcessing && activeTab === "upload" && (
                    <div className="flex items-center text-accent animate-pulse">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {processingMessage}
                    </div>
                  )}
              </div>
            </TabsContent>

            {/* 2. Mapping Tab */}
            <TabsContent value="mapping">
              {isProcessing && activeTab === "mapping" && ( // Show loader only on mapping tab if processing
                 <div className="flex items-center justify-center text-accent animate-pulse p-4">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {processingMessage}
                  </div>
               )}
              {!isProcessing && headers.length > 0 && (
                <div className="space-y-6">
                  <Card>
                     <CardHeader>
                         <CardTitle className="text-xl">Mapeamento de Colunas de Entrada</CardTitle>
                         <CardDescription>Associe as colunas do seu arquivo ({headers.length} colunas detectadas), configure tipos, tamanhos e remoção de máscaras.</CardDescription>
                     </CardHeader>
                     <CardContent>
                       <div className="flex justify-end items-center mb-4 gap-2">
                         <Label htmlFor="show-preview" className="text-sm font-medium">Mostrar Pré-visualização (5 linhas)</Label>
                         <Switch id="show-preview" checked={showPreview} onCheckedChange={setShowPreview} />
                       </div>
                       {showPreview && (
                          <div className="mb-6 max-h-60 overflow-auto border rounded-md bg-secondary/30">
                             <Table>
                                 <TableHeader>
                                     <TableRow>
                                         {headers.map((header, idx) => <TableHead key={`prev-h-${idx}`}>{header}</TableHead>)}
                                     </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                     {getSampleData().map((row, rowIndex) => (
                                         <TableRow key={`prev-r-${rowIndex}`}>
                                             {headers.map((header, colIndex) => (
                                                 <TableCell key={`prev-c-${rowIndex}-${colIndex}`} className="text-xs whitespace-nowrap">
                                                    {String(row[header] ?? '').substring(0, 50)}
                                                    {String(row[header] ?? '').length > 50 ? '...' : ''}
                                                 </TableCell>
                                             ))}
                                         </TableRow>
                                     ))}
                                      {getSampleData().length === 0 && (
                                          <TableRow><TableCell colSpan={headers.length} className="text-center text-muted-foreground">Nenhuma linha de dados na pré-visualização.</TableCell></TableRow>
                                       )}
                                 </TableBody>
                             </Table>
                          </div>
                        )}

                        <div className="max-h-[45vh] overflow-auto"> {/* Slightly increased height */}
                           <Table>
                             <TableHeader>
                               <TableRow>
                                 <TableHead className="w-[22%]">Coluna Original</TableHead>
                                 <TableHead className="w-[22%]">Mapear para Campo</TableHead>
                                 <TableHead className="w-[18%]">Tipo</TableHead>
                                 <TableHead className="w-[10%]"> {/* Size */}
                                     Tam.
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                 <Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Opcional. Define o tamanho máx.</p>
                                                <p>Usado para definir o tamanho na saída TXT.</p>
                                                <p>(Ignorado para tipos não-Alfanuméricos).</p> {/* Updated comment */}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                 </TableHead>
                                 <TableHead className="w-[20%] text-center"> {/* Remove Mask */}
                                     Remover Máscara
                                      <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                 <Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Remove caracteres não numéricos/separadores.</p>
                                                <p>Útil para CPF, CNPJ, Data, Numérico etc.</p> {/* Updated types */}
                                                 <p>(Padrão: Ativado para tipos relevantes)</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                  </TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                               {columnMappings.map((mapping, index) => {
                                 const mappedFieldDetails = mapping.mappedField ? predefinedFields.find(pf => pf.id === mapping.mappedField) : null;
                                 return (
                                     <TableRow key={index}>
                                       <TableCell className="font-medium text-xs">{mapping.originalHeader}</TableCell>
                                       <TableCell>
                                            <div className="flex items-center gap-1"> {/* Container for select and tooltip */}
                                                 <Select
                                                   value={mapping.mappedField || NONE_VALUE_PLACEHOLDER}
                                                   onValueChange={(value) => handleMappingChange(index, 'mappedField', value)}
                                                    disabled={isProcessing}
                                                 >
                                                   <SelectTrigger className="text-xs h-8 flex-grow"> {/* Allow select to grow */}
                                                     <SelectValue placeholder="Selecione ou deixe em branco" />
                                                   </SelectTrigger>
                                                   <SelectContent>
                                                     <SelectItem value={NONE_VALUE_PLACEHOLDER}>-- Sem mapeamento --</SelectItem>
                                                     {memoizedPredefinedFields.map(field => ( // Use memoized list
                                                       <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>
                                                     ))}
                                                   </SelectContent>
                                                 </Select>
                                                 {/* Tooltip for comment */}
                                                 {mappedFieldDetails?.comment && (
                                                      <TooltipProvider>
                                                          <Tooltip>
                                                              <TooltipTrigger asChild>
                                                                  <HelpCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-help" />
                                                              </TooltipTrigger>
                                                              <TooltipContent>
                                                                  <p>{mappedFieldDetails.comment}</p>
                                                              </TooltipContent>
                                                          </Tooltip>
                                                      </TooltipProvider>
                                                  )}
                                           </div>
                                       </TableCell>
                                       <TableCell>
                                         <Select
                                           value={mapping.dataType || NONE_VALUE_PLACEHOLDER}
                                           onValueChange={(value) => handleMappingChange(index, 'dataType', value)}
                                           disabled={isProcessing || !mapping.mappedField} // Disable if not mapped
                                         >
                                           <SelectTrigger className="text-xs h-8">
                                             <SelectValue placeholder="Tipo (Obrigatório se mapeado)" />
                                           </SelectTrigger>
                                           <SelectContent>
                                             <SelectItem value={NONE_VALUE_PLACEHOLDER} disabled>-- Selecione --</SelectItem>
                                             {DATA_TYPES.map(type => ( // Updated DATA_TYPES
                                               <SelectItem key={type} value={type}>{type}</SelectItem>
                                             ))}
                                           </SelectContent>
                                         </Select>
                                       </TableCell>
                                       <TableCell>
                                         <Input
                                           type="number"
                                           min="1"
                                           value={mapping.length ?? ''}
                                           onChange={(e) => handleMappingChange(index, 'length', e.target.value)}
                                           placeholder="Tam." // Shorter placeholder
                                           className="w-full text-xs h-8"
                                            // Updated: Enable only for Alfanumérico
                                           disabled={isProcessing || !mapping.dataType || mapping.dataType !== 'Alfanumérico'}
                                         />
                                       </TableCell>
                                        <TableCell className="text-center"> {/* Center align Switch */}
                                          <Switch
                                              checked={mapping.removeMask}
                                              onCheckedChange={(checked) => handleMappingChange(index, 'removeMask', checked)}
                                               // Updated: Disable only for Alfanumérico
                                              disabled={isProcessing || !mapping.dataType || mapping.dataType === 'Alfanumérico'}
                                              aria-label={`Remover máscara para ${mapping.originalHeader}`}
                                              className="scale-75" // Slightly smaller switch
                                          />
                                       </TableCell>
                                     </TableRow>
                                   );
                               })}
                             </TableBody>
                           </Table>
                         </div>
                     </CardContent>
                  </Card>

                  <Card>
                     <CardHeader>
                         <CardTitle className="text-xl">Gerenciar Campos Pré-definidos</CardTitle>
                         <CardDescription>Adicione, edite ou remova campos personalizados para o mapeamento. Campos persistentes ficam salvos no navegador.</CardDescription>
                     </CardHeader>
                      <CardContent>
                         <div className="flex justify-end mb-4">
                             <Button onClick={openAddPredefinedFieldDialog} disabled={isProcessing} variant="outline">
                                 <Plus className="mr-2 h-4 w-4" /> Adicionar Novo Campo
                             </Button>
                         </div>
                         <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2 bg-secondary/30">
                              {memoizedPredefinedFields.map(field => ( // Use memoized list
                                 <div key={field.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                                     <div className="flex items-center gap-1"> {/* Group name, id, icons */}
                                         <span className="text-sm font-medium">{field.name}</span>
                                         <span className="text-xs text-muted-foreground">({field.id})</span>
                                         {field.isCore && <span className="ml-1 text-xs text-blue-500">(Original)</span>}
                                          {/* Check localStorage for persistence */}
                                          {!field.isCore && localStorage.getItem(PREDEFINED_FIELDS_STORAGE_KEY)?.includes(`"id":"${field.id}"`) && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Save className="h-3 w-3 inline-block ml-1 text-green-600 cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>Persistente (salvo no navegador)</p></TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                          {field.comment && (
                                               <TooltipProvider>
                                                  <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <HelpCircle className="h-3 w-3 inline-block ml-1 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent><p>{field.comment}</p></TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                           )}
                                     </div>
                                     <div className="flex gap-1">
                                           <TooltipProvider>
                                               <Tooltip>
                                                   <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => openEditPredefinedFieldDialog(field)}
                                                            disabled={isProcessing}
                                                            className="h-7 w-7 text-muted-foreground hover:text-accent" // Changed hover color
                                                            aria-label={`Editar campo ${field.name}`}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                   </TooltipTrigger>
                                                   <TooltipContent><p>Editar "{field.name}"</p></TooltipContent>
                                               </Tooltip>
                                           </TooltipProvider>
                                           <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                         <Button
                                                             variant="ghost"
                                                             size="icon"
                                                             onClick={() => removePredefinedField(field.id)}
                                                             disabled={isProcessing || field.isCore} // Disable removal of core fields
                                                             className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:text-muted-foreground/50 disabled:cursor-not-allowed"
                                                             aria-label={`Remover campo ${field.name}`}
                                                         >
                                                             <Trash2 className="h-4 w-4" />
                                                         </Button>
                                                    </TooltipTrigger>
                                                   <TooltipContent>
                                                        {field.isCore
                                                            ? <p>Não é possível remover campos originais.</p>
                                                            : <p>Remover campo "{field.name}"</p>
                                                        }
                                                   </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                       </div>
                                 </div>
                             ))}
                             {memoizedPredefinedFields.length === 0 && <p className="text-sm text-muted-foreground text-center p-2">Nenhum campo definido.</p>}
                         </div>
                      </CardContent>
                       <CardFooter className="flex justify-end">
                          <Button onClick={() => setActiveTab("config")} disabled={isProcessing || columnMappings.length === 0} variant="default">
                              Próximo: Configurar Saída <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                       </CardFooter>
                  </Card>
                </div>
              )}
               {!isProcessing && headers.length === 0 && file && (
                 <p className="text-center text-muted-foreground p-4">Nenhum cabeçalho encontrado ou arquivo ainda não processado/inválido.</p>
               )}
               {!isProcessing && !file && (
                   <p className="text-center text-muted-foreground p-4">Faça o upload de um arquivo na aba "Upload" para começar.</p>
               )}
            </TabsContent>

            {/* 3. Configuration Tab */}
            <TabsContent value="config">
              {isProcessing && activeTab === "config" && ( // Show loader only on config tab if processing
                 <div className="flex items-center justify-center text-accent animate-pulse p-4">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {processingMessage}
                  </div>
               )}
               {!isProcessing && file && ( // Allow access even if headers.length === 0 for static fields
                 <div className="space-y-6">
                    <Card>
                        <CardHeader>
                             <CardTitle className="text-xl">Configuração do Arquivo de Saída</CardTitle>
                             <CardDescription>Defina formato, codificação, delimitador (CSV), ordem e formatação dos campos.</CardDescription>
                         </CardHeader>
                         <CardContent className="space-y-4">
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="flex-1">
                                    <Label htmlFor="output-format">Formato de Saída</Label>
                                    <Select
                                        value={outputConfig.format}
                                        onValueChange={(value) => handleOutputFormatChange(value as OutputFormat)}
                                        disabled={isProcessing}
                                    >
                                        <SelectTrigger id="output-format" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="txt">TXT Posicional (Largura Fixa)</SelectItem>
                                            <SelectItem value="csv">CSV (Delimitado)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                 <div className="flex-1">
                                      <div className="flex items-center">
                                        <Label htmlFor="output-encoding">Codificação</Label>
                                         <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                         <Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Define a codificação de caracteres do arquivo de saída.</p>
                                                        <p>UTF-8 é recomendado, ISO-8859-1 (Latin-1) ou Windows-1252 podem ser necessários para sistemas legados.</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                        </TooltipProvider>
                                       </div>
                                    <Select
                                        value={outputEncoding}
                                        onValueChange={(value) => setOutputEncoding(value as OutputEncoding)}
                                        disabled={isProcessing}
                                    >
                                        <SelectTrigger id="output-encoding" className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OUTPUT_ENCODINGS.map(enc => (
                                                <SelectItem key={enc} value={enc}>{enc}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>


                                {outputConfig.format === 'csv' && (
                                    <div className="flex-1 md:max-w-[150px]">
                                        <div className="flex items-center">
                                            <Label htmlFor="csv-delimiter">Delimitador CSV</Label>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                         <Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Caractere(s) para separar os campos (ex: | ; , ).</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                         </div>
                                        <Input
                                            id="csv-delimiter"
                                            type="text"
                                            value={outputConfig.delimiter || ''}
                                            onChange={handleDelimiterChange}
                                            placeholder="Ex: |"
                                            className="w-full"
                                            disabled={isProcessing}
                                            maxLength={5}
                                        />
                                    </div>
                                )}
                            </div>

                             <div>
                                 <h3 className="text-lg font-medium mb-2">Campos de Saída</h3>
                                  <p className="text-xs text-muted-foreground mb-2">Defina a ordem, conteúdo e formatação dos campos no arquivo final.</p>
                                 <div className="max-h-[45vh] overflow-auto border rounded-md">
                                     <Table>
                                         <TableHeader>
                                             <TableRow>
                                                  <TableHead className="w-[60px]">Ordem</TableHead>
                                                  <TableHead className="w-3/12">Campo</TableHead>
                                                   <TableHead className="w-2/12">Formato Data</TableHead> {/* Date Format */}
                                                  {outputConfig.format === 'txt' && (
                                                      <>
                                                          <TableHead className="w-[80px]"> {/* Size */}
                                                              Tam.
                                                              <TooltipProvider>
                                                                  <Tooltip>
                                                                      <TooltipTrigger asChild><Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger>
                                                                      <TooltipContent><p>Tamanho fixo (obrigatório).</p></TooltipContent>
                                                                  </Tooltip>
                                                              </TooltipProvider>
                                                          </TableHead>
                                                           <TableHead className="w-[80px]"> {/* Padding Char */}
                                                              Preench.
                                                               <TooltipProvider>
                                                                  <Tooltip>
                                                                      <TooltipTrigger asChild><Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger>
                                                                      <TooltipContent><p>Caractere (1) p/ preencher.</p></TooltipContent>
                                                                  </Tooltip>
                                                              </TooltipProvider>
                                                           </TableHead>
                                                           <TableHead className="w-2/12"> {/* Padding Direction */}
                                                              Direção Preench.
                                                               <TooltipProvider>
                                                                  <Tooltip>
                                                                      <TooltipTrigger asChild><Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger>
                                                                      <TooltipContent>
                                                                            <p>Esquerda (p/ números) ou Direita (p/ texto).</p>
                                                                       </TooltipContent>
                                                                  </Tooltip>
                                                              </TooltipProvider>
                                                           </TableHead>
                                                      </>
                                                  )}
                                                  <TableHead className={`w-[80px] text-right ${outputConfig.format === 'csv' ? 'pl-20' : ''}`}>Ações</TableHead>
                                             </TableRow>
                                         </TableHeader>
                                         <TableBody>
                                             {outputConfig.fields.map((field) => {
                                                 const mapping = !field.isStatic ? columnMappings.find(cm => cm.mappedField === field.mappedField) : undefined;
                                                 const dataType = mapping?.dataType ?? null;
                                                 const isDateField = !field.isStatic && dataType === 'Data';

                                                 return (
                                                 <TableRow key={field.id}>
                                                      <TableCell>
                                                         <Input
                                                             type="number"
                                                             min="0"
                                                             value={field.order}
                                                             onChange={(e) => handleOutputFieldChange(field.id, 'order', e.target.value)}
                                                             className="w-14 h-8 text-xs"
                                                             disabled={isProcessing}
                                                             aria-label={`Ordem do campo ${field.isStatic ? field.fieldName : (predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? field.mappedField)}`}
                                                         />
                                                      </TableCell>
                                                     <TableCell className="text-xs">
                                                         {field.isStatic ? (
                                                             <div className="flex items-center gap-1">
                                                                <span className="font-medium text-blue-600 dark:text-blue-400" title={`Valor: ${field.staticValue}`}>{field.fieldName} (Estático)</span>
                                                                 <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-accent-foreground" onClick={() => openEditStaticFieldDialog(field)}>
                                                                     <Edit className="h-3 w-3" />
                                                                 </Button>
                                                             </div>
                                                         ) : (
                                                            renderMappedOutputFieldSelect(field)
                                                         )}
                                                     </TableCell>
                                                     <TableCell> {/* Date Format Select */}
                                                          <Select
                                                               value={field.dateFormat ?? ''}
                                                               onValueChange={(value) => handleOutputFieldChange(field.id, 'dateFormat', value)}
                                                               disabled={isProcessing || !isDateField}
                                                            >
                                                                <SelectTrigger className={`w-full h-8 text-xs ${!isDateField ? 'invisible' : ''}`}>
                                                                    <SelectValue placeholder="Formato Data" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {/* <SelectItem value="" disabled>-- Selecione --</SelectItem> */}
                                                                    <SelectItem value="YYYYMMDD">AAAA MM DD</SelectItem>
                                                                    <SelectItem value="DDMMYYYY">DD MM AAAA</SelectItem>
                                                                </SelectContent>
                                                          </Select>
                                                     </TableCell>
                                                     {outputConfig.format === 'txt' && (
                                                        <>
                                                          <TableCell>
                                                             <Input
                                                                 type="number"
                                                                 min="1"
                                                                 value={field.length ?? ''}
                                                                 onChange={(e) => handleOutputFieldChange(field.id, 'length', e.target.value)}
                                                                 placeholder="Obrig."
                                                                 className="w-full h-8 text-xs"
                                                                 required
                                                                 disabled={isProcessing}
                                                                 aria-label={`Tamanho do campo ${field.isStatic ? field.fieldName : (predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? field.mappedField)}`}
                                                             />
                                                          </TableCell>
                                                          <TableCell>
                                                             <Input
                                                                type="text"
                                                                maxLength={1}
                                                                value={field.paddingChar ?? ''}
                                                                onChange={(e) => handleOutputFieldChange(field.id, 'paddingChar', e.target.value)}
                                                                 placeholder={getDefaultPaddingChar(field, columnMappings)} // Dynamic placeholder based on default
                                                                className="w-10 text-center h-8 text-xs"
                                                                 required
                                                                disabled={isProcessing}
                                                                aria-label={`Caractere de preenchimento do campo ${field.isStatic ? field.fieldName : (predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? field.mappedField)}`}
                                                             />
                                                         </TableCell>
                                                         <TableCell>
                                                              <Select
                                                                  value={field.paddingDirection ?? getDefaultPaddingDirection(field, columnMappings)} // Use default if not set
                                                                 onValueChange={(value) => handleOutputFieldChange(field.id, 'paddingDirection', value)}
                                                                 disabled={isProcessing}
                                                               >
                                                                  <SelectTrigger className="w-full h-8 text-xs">
                                                                       <SelectValue />
                                                                   </SelectTrigger>
                                                                   <SelectContent>
                                                                        <SelectItem value="left">Esquerda</SelectItem>
                                                                        <SelectItem value="right">Direita</SelectItem>
                                                                    </SelectContent>
                                                              </Select>
                                                          </TableCell>
                                                        </>
                                                     )}
                                                      <TableCell className={`text-right ${outputConfig.format === 'csv' ? 'pl-20' : ''}`}>
                                                          <TooltipProvider>
                                                              <Tooltip>
                                                                  <TooltipTrigger asChild>
                                                                         <Button
                                                                             variant="ghost"
                                                                             size="icon"
                                                                             onClick={() => removeOutputField(field.id)}
                                                                             disabled={isProcessing}
                                                                             className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                                             aria-label={`Remover campo ${field.isStatic ? field.fieldName : (predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? field.mappedField)} da saída`}
                                                                         >
                                                                             <Trash2 className="h-4 w-4" />
                                                                         </Button>
                                                                   </TooltipTrigger>
                                                                   <TooltipContent>
                                                                       <p>Remover campo da saída</p>
                                                                   </TooltipContent>
                                                               </Tooltip>
                                                           </TooltipProvider>
                                                     </TableCell>
                                                 </TableRow>
                                                 );
                                            })}
                                             {outputConfig.fields.length === 0 && (
                                                 <TableRow>
                                                      <TableCell colSpan={outputConfig.format === 'txt' ? 7 : 4} className="text-center text-muted-foreground py-4">
                                                         Nenhum campo adicionado à saída. Use os botões abaixo.
                                                     </TableCell>
                                                 </TableRow>
                                              )}
                                         </TableBody>
                                     </Table>
                                  </div>
                                   <div className="flex gap-2 mt-2">
                                      <Button onClick={addOutputField} variant="outline" size="sm" disabled={isProcessing || columnMappings.filter(m => m.mappedField !== null && !outputConfig.fields.some(of => !of.isStatic && of.mappedField === m.mappedField)).length === 0}>
                                          <Plus className="mr-2 h-4 w-4" /> Adicionar Campo Mapeado
                                      </Button>
                                      <Button onClick={openAddStaticFieldDialog} variant="outline" size="sm" disabled={isProcessing}>
                                          <Plus className="mr-2 h-4 w-4" /> Adicionar Campo Estático
                                      </Button>
                                   </div>
                             </div>
                         </CardContent>
                         <CardFooter className="flex justify-between">
                             <Button variant="outline" onClick={() => setActiveTab("mapping")} disabled={isProcessing}>Voltar</Button>
                             <Button onClick={convertFile} disabled={isProcessing || outputConfig.fields.length === 0} variant="default">
                                 {isProcessing ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Convertendo...
                                    </>
                                    ) : (
                                    <>
                                        Iniciar Conversão <ArrowRight className="ml-2 h-4 w-4" />
                                    </>
                                    )}

                             </Button>
                         </CardFooter>
                    </Card>
                 </div>
                )}
                 {!isProcessing && !file && (
                    <p className="text-center text-muted-foreground p-4">Complete as etapas de Upload e Mapeamento primeiro.</p>
                )}
            </TabsContent>

             {/* 4. Result Tab */}
            <TabsContent value="result">
               {isProcessing && activeTab === "result" && ( // Show loader only on result tab if processing
                 <div className="flex items-center justify-center text-accent animate-pulse p-4">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {processingMessage}
                  </div>
               )}
                {!isProcessing && convertedData && (
                    <Card>
                         <CardHeader>
                             <CardTitle className="text-xl">Resultado da Conversão</CardTitle>
                             <CardDescription>
                                Pré-visualização do arquivo convertido ({outputConfig.format.toUpperCase()}, {outputEncoding}). Verifique antes de baixar.
                             </CardDescription>
                         </CardHeader>
                         <CardContent>
                             <Textarea
                                 readOnly
                                  // Attempt to decode buffer for display, fallback for plain string
                                 value={convertedData instanceof Buffer
                                          ? iconv.decode(convertedData, outputEncoding)
                                          : String(convertedData) /* Ensure it's a string */}
                                 className="w-full h-64 font-mono text-xs bg-secondary/30 border rounded-md"
                                 placeholder="Resultado da conversão aparecerá aqui..."
                                 aria-label="Pré-visualização do arquivo convertido"
                             />
                         </CardContent>
                         <CardFooter className="flex flex-col sm:flex-row justify-between gap-2">
                             <Button variant="outline" onClick={() => setActiveTab("config")} disabled={isProcessing}>Voltar à Configuração</Button>
                            <div className="flex gap-2">
                                 <Button onClick={resetState} variant="outline" className="mr-2" disabled={isProcessing}>
                                     <Trash2 className="mr-2 h-4 w-4" /> Nova Conversão
                                 </Button>
                                 <Button onClick={openDownloadDialog} disabled={isProcessing || !convertedData} variant="default">
                                     Baixar Arquivo Convertido
                                 </Button>
                            </div>
                         </CardFooter>
                    </Card>
                )}
                 {!isProcessing && !convertedData && (
                    <p className="text-center text-muted-foreground p-4">Execute a conversão na aba "Configurar Saída" para ver o resultado.</p>
                )}
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="text-center text-xs text-muted-foreground pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-2">
            {/* Ads Placeholder */}
             <div className="flex gap-4 justify-center w-full sm:w-auto">
                 <div className="w-32 h-16 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-muted-foreground text-xs rounded">Ad Placeholder 1</div>
                 <div className="w-32 h-16 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-muted-foreground text-xs rounded">Ad Placeholder 2</div>
             </div>
             <div className="flex flex-col items-center sm:items-end">
                 <span>
                     © {new Date().getFullYear()} SCA. Ferramenta de conversão de dados. - Desenvolvido por <a href="mailto:faraujo@gmail.com" className="text-accent hover:underline">Fábio Araújo</a>
                 </span>
                 <span className="font-mono text-accent mt-1">v{appVersion}</span> {/* Display Version */}
            </div>
        </CardFooter>
      </Card>

        {/* Add/Edit Static Field Dialog */}
        <Dialog open={staticFieldDialogState.isOpen} onOpenChange={(isOpen) => setStaticFieldDialogState(prev => ({ ...prev, isOpen }))}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{staticFieldDialogState.isEditing ? 'Editar' : 'Adicionar'} Campo Estático</DialogTitle>
                    <DialogDescription>
                       Defina um campo com valor fixo para incluir no arquivo de saída.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="static-field-name" className="text-right">
                            Nome
                        </Label>
                        <Input
                            id="static-field-name"
                            value={staticFieldDialogState.fieldName}
                            onChange={(e) => handleStaticFieldDialogChange('fieldName', e.target.value)}
                            className="col-span-3"
                            placeholder="Ex: FlagAtivo"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="static-field-value" className="text-right">
                            Valor
                        </Label>
                        <Input
                            id="static-field-value"
                            value={staticFieldDialogState.staticValue}
                            onChange={(e) => handleStaticFieldDialogChange('staticValue', e.target.value)}
                            className="col-span-3"
                             placeholder="Ex: S ou 001001"
                        />
                    </div>
                     {outputConfig.format === 'txt' && (
                         <>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="static-field-length" className="text-right">
                                    Tamanho
                                </Label>
                                <Input
                                    id="static-field-length"
                                    type="number"
                                    min="1"
                                    value={staticFieldDialogState.length}
                                    onChange={(e) => handleStaticFieldDialogChange('length', e.target.value)}
                                    className="col-span-3"
                                    required
                                    placeholder="Obrigatório para TXT"
                                />
                             </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="static-field-padding-char" className="text-right">
                                    Preencher
                                </Label>
                                <Input
                                    id="static-field-padding-char"
                                    type="text"
                                    maxLength={1}
                                    value={staticFieldDialogState.paddingChar}
                                    onChange={(e) => handleStaticFieldDialogChange('paddingChar', e.target.value)}
                                    className="col-span-1 text-center"
                                    required
                                    placeholder={/^-?\d+$/.test(staticFieldDialogState.staticValue) ? '0' : ' '} // Default 0 for numeric, space otherwise
                                />
                            </div>
                             <div className="grid grid-cols-4 items-center gap-4">
                                 <Label htmlFor="static-field-padding-direction" className="text-right">
                                     Direção
                                 </Label>
                                 <Select
                                       value={staticFieldDialogState.paddingDirection}
                                       onValueChange={(value) => handleStaticFieldDialogChange('paddingDirection', value)}
                                       disabled={isProcessing}
                                    >
                                       <SelectTrigger className="col-span-3">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                             <SelectItem value="left">Esquerda</SelectItem>
                                             <SelectItem value="right">Direita</SelectItem>
                                         </SelectContent>
                                  </Select>
                              </div>
                         </>
                     )}
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button type="button" onClick={saveStaticField}>Salvar Campo</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Add/Edit Predefined Field Dialog */}
        <Dialog open={predefinedFieldDialogState.isOpen} onOpenChange={(isOpen) => setPredefinedFieldDialogState(prev => ({ ...prev, isOpen }))}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{predefinedFieldDialogState.isEditing ? 'Editar' : 'Adicionar'} Campo Pré-definido</DialogTitle>
                    <DialogDescription>
                        {predefinedFieldDialogState.isEditing
                            ? "Edite o nome e o comentário do campo personalizado."
                            : "Adicione um novo campo para usar no mapeamento."}
                         Campos originais não podem ser removidos ou ter persistência alterada.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="predefined-field-name" className="text-right">
                            Nome*
                        </Label>
                        <Input
                            id="predefined-field-name"
                            value={predefinedFieldDialogState.fieldName}
                            onChange={(e) => handlePredefinedFieldDialogChange('fieldName', e.target.value)}
                            className="col-span-3"
                            placeholder="Ex: ID Cliente"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="predefined-field-comment" className="text-right">
                             Comentário
                         </Label>
                         <Textarea
                             id="predefined-field-comment"
                             value={predefinedFieldDialogState.comment}
                             onChange={(e) => handlePredefinedFieldDialogChange('comment', e.target.value)}
                             className="col-span-3 min-h-[60px]" // Adjust height
                             placeholder="Opcional: Descrição curta ou instrução de uso"
                         />
                    </div>
                     {/* Allow changing persistence for custom fields, show current state for core fields */}
                    <div className="grid grid-cols-4 items-center gap-4">
                         <Label htmlFor="predefined-persist" className="text-right col-span-3">
                            Manter para futuras conversões?
                         </Label>
                         <div className="col-span-1 flex items-center justify-start">
                            <Checkbox
                                 id="predefined-persist"
                                 checked={predefinedFieldDialogState.persist}
                                 onCheckedChange={(checked) => handlePredefinedFieldDialogChange('persist', Boolean(checked))} // Ensure boolean
                                 aria-label="Manter campo para futuras conversões"
                                 disabled={predefinedFields.find(f => f.id === predefinedFieldDialogState.fieldId)?.isCore} // Disable for core fields
                             />
                         </div>
                     </div>
                    <p className="text-xs text-muted-foreground col-span-4">* Nome é obrigatório.</p>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button type="button" onClick={savePredefinedField}>
                         {predefinedFieldDialogState.isEditing ? 'Salvar Alterações' : 'Adicionar Campo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

       {/* Download File Dialog */}
        <Dialog open={downloadDialogState.isOpen} onOpenChange={(isOpen) => setDownloadDialogState(prev => ({ ...prev, isOpen }))}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Renomear e Baixar Arquivo</DialogTitle>
                    <DialogDescription>
                       Confirme ou altere o nome do arquivo antes de baixar.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="download-filename" className="text-right">
                            Nome do Arquivo
                        </Label>
                        <Input
                            id="download-filename"
                            value={downloadDialogState.finalFilename}
                            onChange={handleDownloadFilenameChange}
                            className="col-span-3"
                            placeholder="Nome do arquivo de saída"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline">Cancelar</Button>
                    </DialogClose>
                    <Button type="button" onClick={confirmDownload} disabled={!downloadDialogState.finalFilename}>Confirmar Download</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

    </div>
  );
}
