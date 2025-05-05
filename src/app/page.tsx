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
import { Upload, FileText, FileSpreadsheet, Settings, ArrowRight, Trash2, Plus, HelpCircle, Columns, Edit, Code, Loader2, Save, RotateCcw } from 'lucide-react'; // Added Edit, Code, Loader2, Save, RotateCcw
import { useToast } from "@/hooks/use-toast";
import { Textarea } from '@/components/ui/textarea';
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog"; // Import Dialog components
import { extractPdfTable, type ExtractPdfTableOutput } from '@/ai/flows/extract-pdf-table-flow'; // Import the AI flow
import { Checkbox } from '@/components/ui/checkbox'; // Import Checkbox

// Define types
type DataType = 'Inteiro' | 'Alfanumérico' | 'Numérico' | 'Data' | 'CPF' | 'CNPJ';
type PredefinedField = {
    id: string;
    name: string;
    isCore: boolean; // True for original, hardcoded fields
    comment?: string;
    isPersistent?: boolean; // Tracks if a custom field is saved in localStorage
};
type ColumnMapping = {
  originalHeader: string;
  mappedField: string | null; // ID of predefined field or null
  dataType: DataType | null;
  length?: number | null;
  removeMask: boolean;
};
type OutputFormat = 'txt' | 'csv';
type PaddingDirection = 'left' | 'right';
type DateFormat = 'YYYYMMDD' | 'DDMMYYYY';
type OutputEncoding = 'UTF-8' | 'ISO-8859-1' | 'Windows-1252';

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
    isPersistent: boolean; // Replaced 'persist' for clarity
    comment: string;
}


const CORE_PREDEFINED_FIELDS: PredefinedField[] = [
  { id: 'matricula', name: 'Matrícula', isCore: true, comment: 'Número de matrícula do servidor/funcionário.', isPersistent: true }, // Core fields are always persistent conceptually
  { id: 'cpf', name: 'CPF', isCore: true, comment: 'Cadastro de Pessoa Física. Será formatado sem máscara na saída se a opção estiver marcada.', isPersistent: true },
  { id: 'rg', name: 'RG', isCore: true, comment: 'Registro Geral (Identidade). Pode conter letras e números.', isPersistent: true },
  { id: 'nome', name: 'Nome', isCore: true, comment: 'Nome completo.', isPersistent: true },
  { id: 'email', name: 'E-mail', isCore: true, comment: 'Endereço de e-mail.', isPersistent: true },
  { id: 'cnpj', name: 'CNPJ', isCore: true, comment: 'Cadastro Nacional da Pessoa Jurídica. Será formatado sem máscara na saída se a opção estiver marcada.', isPersistent: true },
  { id: 'regime', name: 'Regime', isCore: true, comment: 'Regime de contratação (ex: CLT, Estatutário).', isPersistent: true },
  { id: 'situacao', name: 'Situação', isCore: true, comment: 'Situação funcional (ex: Ativo, Inativo).', isPersistent: true },
  { id: 'categoria', name: 'Categoria', isCore: true, comment: 'Categoria funcional.', isPersistent: true },
  { id: 'secretaria', name: 'Secretaria', isCore: true, comment: 'Secretaria ou órgão de lotação.', isPersistent: true },
  { id: 'setor', name: 'Setor', isCore: true, comment: 'Setor ou departamento específico.', isPersistent: true },
  { id: 'margem_bruta', name: 'Margem Bruta', isCore: true, comment: 'Valor da margem bruta consignável (Numérico).', isPersistent: true },
  { id: 'margem_reservada', name: 'Margem Reservada', isCore: true, comment: 'Valor da margem reservada (Numérico).', isPersistent: true },
  { id: 'margem_liquida', name: 'Margem Líquida', isCore: true, comment: 'Valor da margem líquida disponível (Numérico).', isPersistent: true },
].map(f => ({ ...f, isPersistent: true })); // Ensure all core fields are marked as persistent


const DATA_TYPES: DataType[] = ['Inteiro', 'Alfanumérico', 'Numérico', 'Data', 'CPF', 'CNPJ'];
const OUTPUT_ENCODINGS: OutputEncoding[] = ['UTF-8', 'ISO-8859-1', 'Windows-1252'];

const NONE_VALUE_PLACEHOLDER = "__NONE__";
const PREDEFINED_FIELDS_STORAGE_KEY = 'sca-predefined-fields-v1'; // Updated storage key


// Helper to check if a data type is numeric-like
const isNumericType = (dataType: DataType | null): boolean => {
    return dataType === 'Inteiro' || dataType === 'Numérico' || dataType === 'CPF' || dataType === 'CNPJ';
}

// Helper to get default padding char based on type
const getDefaultPaddingChar = (field: OutputFieldConfig, mappings: ColumnMapping[]): string => {
    if (field.isStatic) {
        // Default to space for static unless value is purely numeric
        return /^-?\d+$/.test(field.staticValue) ? '0' : ' ';
    } else {
        const mapping = mappings.find(m => m.mappedField === field.mappedField);
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
        return isNumericType(mapping?.dataType ?? null) ? 'left' : 'right';
    }
}

// Helper to format number to specified decimals (handles negatives)
const formatNumber = (value: string | number, decimals: number): string => {
    const cleanedValue = String(value).replace(/[R$., ]/g, (match) => match === '.' ? '.' : '');
    const num = Number(cleanedValue.replace(',', '.'));

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
        case 'RG':
            return stringValue.replace(/[.-]/g, '');
        case 'Data':
            return stringValue.replace(/\D/g, '');
        case 'Alfanumérico':
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
  const [convertedData, setConvertedData] = useState<string | Buffer>('');
  const [outputEncoding, setOutputEncoding] = useState<OutputEncoding>('UTF-8');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingMessage, setProcessingMessage] = useState<string>('Processando...');
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
       isPersistent: false, // Initialize as not persistent by default for new fields
       comment: '',
   });
    const [downloadDialogState, setDownloadDialogState] = useState<DownloadDialogState>({
        isOpen: false,
        proposedFilename: '',
        finalFilename: '',
    });

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';

   // Load predefined fields from localStorage on mount
   useEffect(() => {
       const storedFieldsJson = localStorage.getItem(PREDEFINED_FIELDS_STORAGE_KEY);
       let customFields: PredefinedField[] = [];
       if (storedFieldsJson) {
           try {
               customFields = JSON.parse(storedFieldsJson)
                    .filter((f: any) => typeof f === 'object' && f.id && f.name && !f.isCore) // Filter out core fields just in case
                    .map((f: any) => ({ // Map to ensure correct structure and add isPersistent flag
                        id: f.id,
                        name: f.name,
                        isCore: false,
                        comment: f.comment || '',
                        isPersistent: true // Fields from storage are persistent
                    }));
           } catch (e) {
               console.error("Falha ao analisar campos pré-definidos do localStorage:", e);
               localStorage.removeItem(PREDEFINED_FIELDS_STORAGE_KEY);
           }
       }
       // Combine core fields with loaded custom fields, ensuring no duplicate IDs
        const combined = [...CORE_PREDEFINED_FIELDS]; // Core fields are already marked persistent
       const coreIds = new Set(CORE_PREDEFINED_FIELDS.map(f => f.id));

       customFields.forEach(cf => {
           if (!coreIds.has(cf.id) && !combined.some(f => f.id === cf.id)) {
               combined.push(cf); // Add custom field (already marked persistent)
           }
       });

       setPredefinedFields(combined);
   }, []);

   // Save only custom, persistent predefined fields to localStorage
   const saveCustomPredefinedFields = useCallback((fieldsToSave: PredefinedField[]) => {
       // Filter for non-core fields marked as persistent
       const customPersistentFields = fieldsToSave.filter(f => !f.isCore && f.isPersistent);
       try {
           localStorage.setItem(PREDEFINED_FIELDS_STORAGE_KEY, JSON.stringify(customPersistentFields));
       } catch (e) {
           console.error("Falha ao salvar campos pré-definidos no localStorage:", e);
           toast({ title: "Erro", description: "Falha ao salvar campos pré-definidos personalizados.", variant: "destructive" });
       }
   }, [toast]);

   // Function to get sample data for preview
   const getSampleData = (): any[] => {
       return fileData.slice(0, 5);
   };


   const resetState = useCallback(() => {
    setFile(null);
    setFileName('');
    setHeaders([]);
    setFileData([]);
    setColumnMappings([]);
    setOutputConfig({ format: 'txt', fields: [] });
    // Don't reset predefined fields loaded from storage, but maybe update their non-persistent state?
    // For now, keep them as they are. Re-evaluate if needed.
    setNewFieldName('');
    setConvertedData('');
    setOutputEncoding('UTF-8');
    setIsProcessing(false);
    setProcessingMessage('Processando...');
    setActiveTab("upload");
    setShowPreview(false);
     setStaticFieldDialogState({ isOpen: false, isEditing: false, fieldName: '', staticValue: '', length: '', paddingChar: ' ', paddingDirection: 'right' });
     setPredefinedFieldDialogState({ isOpen: false, isEditing: false, fieldName: '', isPersistent: false, comment: '' });
      setDownloadDialogState({ isOpen: false, proposedFilename: '', finalFilename: '' });
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
     toast({ title: "Pronto", description: "Formulário reiniciado para nova conversão." });
  }, [toast]);


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
        setFile(null);
        setFileName('');
        const fileInput = event.target as HTMLInputElement;
        if(fileInput) fileInput.value = '';
        return;
      }
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setHeaders([]);
      setFileData([]);
      setColumnMappings([]);
      setConvertedData('');
      setActiveTab("mapping");
      processFile(selectedFile);
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
          'secretaria': ['secretaria', 'orgao', 'unidade', 'orgao pagador'],
          'setor': ['setor', 'departamento', 'lotacao'],
          'margem_bruta': ['margem bruta', 'valor bruto', 'bruto', 'salario bruto'],
          'margem_reservada': ['margem reservada', 'reservada', 'valor reservado'],
          'margem_liquida': ['margem liquida', 'liquido', 'valor liquido', 'disponivel', 'margem disponivel'],
      };

      for (const fieldId in guesses) {
          if (guesses[fieldId].some(keyword => lowerHeader.includes(keyword))) {
              // Ensure the guessed field exists in the current predefinedFields state
              if (predefinedFields.some(pf => pf.id === fieldId)) {
                  return fieldId;
              }
          }
      }
      return null; // No guess or guess not available
  }, [predefinedFields]); // Add predefinedFields dependency

 const guessDataType = useCallback((header: string, sampleData: any): DataType | null => {
      const lowerHeader = header.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const stringSample = String(sampleData).trim();

       // Priority based on header keywords
      if (lowerHeader.includes('cnpj')) return 'CNPJ';
      if (lowerHeader.includes('cpf')) return 'CPF';
      if (lowerHeader.includes('data') || lowerHeader.includes('date') || lowerHeader.includes('nasc')) return 'Data';
      if (lowerHeader.includes('margem') || lowerHeader.includes('valor') || lowerHeader.includes('salario') || lowerHeader.includes('saldo') || lowerHeader.includes('preco') || lowerHeader.includes('brut') || lowerHeader.includes('liquid') || lowerHeader.includes('reservad')) return 'Numérico';
       if (lowerHeader.includes('matricula') || lowerHeader.includes('mat') || lowerHeader.includes('cod') || lowerHeader.includes('numero') || lowerHeader.includes('num') || lowerHeader.includes('id')) return 'Inteiro';
      if (lowerHeader.includes('rg')) return 'Alfanumérico';
       if (lowerHeader.includes('idade') || lowerHeader.includes('quant')) return 'Numérico';
       if (lowerHeader.includes('nome') || lowerHeader.includes('descri') || lowerHeader.includes('obs') || lowerHeader.includes('secretaria') || lowerHeader.includes('setor') || lowerHeader.includes('regime') || lowerHeader.includes('situacao') || lowerHeader.includes('categoria') || lowerHeader.includes('email') || lowerHeader.includes('orgao') || lowerHeader.includes('cargo') || lowerHeader.includes('funcao')) return 'Alfanumérico';

      // Guess based on sample data content if header wasn't decisive
       if (stringSample) {
            if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(stringSample) || /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(stringSample) || /^\d{6,8}$/.test(stringSample)) return 'Data';
            if (/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(stringSample)) return 'CPF';
            if (/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(stringSample)) return 'CNPJ';
            if (/[R$]/.test(stringSample) || /[,.]\d{2}$/.test(stringSample) || /^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(stringSample) || /^-?\d+,\d+$/.test(stringSample) ) return 'Numérico';
            if (/^-?\d+$/.test(stringSample)) return 'Inteiro';
            if (/^-?\d+(\.\d+)?$/.test(stringSample)) return 'Numérico';
        }

       if (/[a-zA-Z]/.test(lowerHeader) || (stringSample && /[a-zA-Z]/.test(stringSample))) return 'Alfanumérico';
       if (/^\d+$/.test(lowerHeader)) return 'Inteiro';

      return 'Alfanumérico';
  }, []);


 const processFile = useCallback(async (fileToProcess: File) => {
     if (!fileToProcess) return;
     setIsProcessing(true);
     setProcessingMessage('Lendo arquivo...');
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
                 const pdfDataUri = e.target?.result as string;
                 if (!pdfDataUri) {
                      toast({ title: "Erro", description: "Falha ao ler o arquivo PDF.", variant: "destructive" });
                      setIsProcessing(false);
                      setActiveTab("upload");
                      return;
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
                            setActiveTab("upload");
                            setHeaders([]);
                            setFileData([]);
                            setColumnMappings([]);
                         } else {
                             extractedHeaders = result.headers;
                             extractedData = [];
                             toast({
                                 title: "Aviso",
                                 description: "Cabeçalhos do PDF extraídos, mas nenhuma linha de dados foi retornada pela IA.",
                                 variant: "default",
                             });
                             setHeaders(extractedHeaders);
                             setFileData(extractedData);
                             setColumnMappings(extractedHeaders.map(header => {
                                const guessedField = guessPredefinedField(header);
                                const guessedType = guessDataType(header, '');
                                return {
                                    originalHeader: header,
                                    mappedField: guessedField,
                                    dataType: guessedType,
                                    length: null,
                                    removeMask: !!guessedField && ['cpf', 'rg', 'cnpj'].includes(guessedField) || ['Data', 'Numérico', 'Inteiro', 'CPF', 'CNPJ'].includes(guessedType ?? ''),
                                };
                             }));
                             toast({ title: "Sucesso Parcial", description: `Cabeçalhos do PDF ${fileToProcess.name} processados. Nenhuma linha de dados retornada. Verifique o mapeamento.` });
                             setActiveTab("mapping");
                         }
                     } else {
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

                         setHeaders(extractedHeaders);
                         setFileData(extractedData);
                         setColumnMappings(extractedHeaders.map(header => {
                            const guessedField = guessPredefinedField(header);
                            const guessedType = guessDataType(header, extractedData.length > 0 ? extractedData[0][header] : '');
                            return {
                                originalHeader: header,
                                mappedField: guessedField,
                                dataType: guessedType,
                                length: null,
                                removeMask: !!guessedField && ['cpf', 'rg', 'cnpj'].includes(guessedField) || ['Data', 'Numérico', 'Inteiro', 'CPF', 'CNPJ'].includes(guessedType ?? ''),
                            }
                         }));
                         toast({ title: "Sucesso", description: `Arquivo PDF ${fileToProcess.name} processado. Verifique o mapeamento.` });
                         setActiveTab("mapping");

                     }

                 } catch (pdfError: any) {
                     console.error("Erro ao processar PDF via IA:", pdfError);
                     toast({
                         title: "Erro ao Processar PDF",
                         description: pdfError.message || "Ocorreu um erro inesperado durante a extração do PDF.",
                         variant: "destructive",
                     });
                      setActiveTab("upload");
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
                 setActiveTab("upload");
                 setHeaders([]);
                 setFileData([]);
                 setColumnMappings([]);
                 setIsProcessing(false);
             };
             pdfReader.readAsDataURL(fileToProcess);

             return;

         } else {
             throw new Error("Tipo de arquivo não suportado para processamento.");
         }

         // --- Common processing logic for non-PDF ---
         if (extractedHeaders.length === 0 && extractedData.length > 0) {
             extractedHeaders = Object.keys(extractedData[0]).map((_, i) => `Coluna ${i + 1}`);
             toast({ title: "Aviso", description: "Cabeçalhos não encontrados, usando 'Coluna 1', 'Coluna 2', etc.", variant: "default" });
         } else if (extractedHeaders.length === 0) {
              throw new Error("Não foi possível extrair cabeçalhos ou dados do arquivo.");
          }


         setHeaders(extractedHeaders);
         setFileData(extractedData);
         setColumnMappings(extractedHeaders.map(header => {
             const guessedField = guessPredefinedField(header);
             const guessedType = guessDataType(header, extractedData.length > 0 ? extractedData[0][header] : '');
             return {
                 originalHeader: header,
                 mappedField: guessedField,
                 dataType: guessedType,
                 length: null,
                 removeMask: !!guessedField && ['cpf', 'rg', 'cnpj'].includes(guessedField) || ['Data', 'Numérico', 'Inteiro', 'CPF', 'CNPJ'].includes(guessedType ?? ''),
             }
         }));
         toast({ title: "Sucesso", description: `Arquivo ${fileToProcess.name} processado. Verifique o mapeamento.` });
         setActiveTab("mapping");

     } catch (error: any) {
         console.error("Erro ao processar arquivo:", error);
         toast({
             title: "Erro ao Processar Arquivo",
             description: error.message || "Ocorreu um erro inesperado.",
             variant: "destructive",
         });
         setActiveTab("upload");
         setHeaders([]);
         setFileData([]);
         setColumnMappings([]);
     } finally {
         if (!fileToProcess?.type.includes('pdf')) {
             setIsProcessing(false);
             setProcessingMessage('Processando...');
         }
     }
 }, [toast, guessPredefinedField, guessDataType, predefinedFields]); // Added predefinedFields dependency




  // --- Mapping ---
  const handleMappingChange = (index: number, field: keyof ColumnMapping, value: any) => {
    setColumnMappings(prev => {
      const newMappings = [...prev];
      const currentMapping = { ...newMappings[index] };
      let actualValue = value === NONE_VALUE_PLACEHOLDER ? null : value;

      if (field === 'dataType') {
         (currentMapping[field] as any) = actualValue;
         if (actualValue !== 'Alfanumérico') {
           currentMapping.length = null;
         }
         currentMapping.removeMask = ['CPF', 'RG', 'CNPJ', 'Data', 'Numérico', 'Inteiro'].includes(actualValue ?? '');

       } else if (field === 'length') {
           const numValue = parseInt(value, 10);
           currentMapping.length = isNaN(numValue) || numValue <= 0 ? null : numValue;
       } else if (field === 'removeMask') {
           currentMapping.removeMask = Boolean(value);
       } else {
          (currentMapping[field] as any) = actualValue;
            if (field === 'mappedField' && actualValue && !currentMapping.dataType) {
                 const predefined = predefinedFields.find(pf => pf.id === actualValue);
                  const sampleData = fileData.length > 0 ? fileData[0][currentMapping.originalHeader] : '';
                 const guessedType = predefined ? guessDataType(predefined.name, sampleData) : guessDataType(currentMapping.originalHeader, sampleData);
                 if(guessedType) currentMapping.dataType = guessedType;
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
            isPersistent: false, // Default to Opcional (not persistent)
            comment: '',
        });
    };

    const openEditPredefinedFieldDialog = (field: PredefinedField) => {
        setPredefinedFieldDialogState({
            isOpen: true,
            isEditing: true,
            fieldId: field.id,
            fieldName: field.name,
            isPersistent: field.isPersistent || false, // Load persistence state
            comment: field.comment || '',
        });
    };

    const handlePredefinedFieldDialogChange = (field: keyof PredefinedFieldDialogState, value: any) => {
         setPredefinedFieldDialogState(prev => ({
             ...prev,
             [field]: value
         }));
     };

   const savePredefinedField = () => {
        const { isEditing, fieldId, fieldName, isPersistent, comment } = predefinedFieldDialogState;
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

          let updatedFields: PredefinedField[];
          let fieldDescription = `Campo "${trimmedName}"`;
          let fieldToUpdateOrAdd: PredefinedField;

          if (isEditing) {
              const originalField = predefinedFields.find(f => f.id === fieldId);
              if (!originalField) return; // Should not happen

               fieldToUpdateOrAdd = {
                  ...originalField,
                  name: trimmedName,
                  comment: comment || '',
                  isPersistent: isPersistent // Update persistence based on checkbox
               };

              updatedFields = predefinedFields.map(f =>
                  f.id === fieldId ? fieldToUpdateOrAdd : f
              );
              fieldDescription += ` atualizado (${isPersistent ? 'Principal' : 'Opcional'}).`;

          } else {
              fieldToUpdateOrAdd = {
                  id: newId,
                  name: trimmedName,
                  comment: comment || '',
                  isCore: false, // New fields are never core
                  isPersistent: isPersistent // Set persistence based on checkbox
              };
              updatedFields = [...predefinedFields, fieldToUpdateOrAdd];
              fieldDescription += ` adicionado com ID "${newId}" (${isPersistent ? 'Principal' : 'Opcional'}).`;
          }

        setPredefinedFields(updatedFields);
        saveCustomPredefinedFields(updatedFields); // Save all potentially updated fields (including changes in persistence)
        setPredefinedFieldDialogState({ isOpen: false, isEditing: false, fieldName: '', isPersistent: false, comment: '' });
        toast({ title: "Sucesso", description: fieldDescription });
    };


  const removePredefinedField = (idToRemove: string) => {
    const fieldToRemove = predefinedFields.find(f => f.id === idToRemove);
    if (!fieldToRemove) return;

    // Allow removing any field now
    // if (fieldToRemove.isCore) {
    //   toast({ title: "Aviso", description: `Não é possível remover o campo pré-definido original "${fieldToRemove.name}".`, variant: "default" });
    //   return;
    // }

     const updatedFields = predefinedFields.filter(f => f.id !== idToRemove);
    setPredefinedFields(updatedFields);

    // Update mappings that used this field
    setColumnMappings(prev => prev.map(m => m.mappedField === idToRemove ? { ...m, mappedField: null } : m));
    // Update output config (remove if it was a mapped field)
    setOutputConfig(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.isStatic || f.mappedField !== idToRemove),
    }));

     // Update localStorage
     saveCustomPredefinedFields(updatedFields);

    toast({ title: "Sucesso", description: `Campo "${fieldToRemove.name}" removido.` });
  };


  // --- Output Configuration ---
   const handleOutputFormatChange = (value: OutputFormat) => {
      setOutputConfig(prev => {
          const newFields = prev.fields.map(f => ({
              ...f,
              delimiter: value === 'csv' ? (prev.delimiter || '|') : undefined,
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

                        if (prev.format === 'txt') {
                            updatedField.length = updatedField.length ?? (correspondingMapping?.length ?? 10);
                            updatedField.paddingChar = updatedField.paddingChar ?? getDefaultPaddingChar(updatedField, columnMappings);
                            updatedField.paddingDirection = updatedField.paddingDirection ?? getDefaultPaddingDirection(updatedField, columnMappings);
                        } else {
                             delete updatedField.length;
                             delete updatedField.paddingChar;
                             delete updatedField.paddingDirection;
                        }
                        if (dataType === 'Data') {
                            updatedField.dateFormat = updatedField.dateFormat ?? 'YYYYMMDD';
                        } else {
                            delete updatedField.dateFormat;
                        }
                    }
                } else if (field === 'length') {
                    const numValue = parseInt(value, 10);
                    updatedField.length = isNaN(numValue) || numValue <= 0 ? undefined : numValue;
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
                else {
                    (updatedField as any)[field] = actualValue;
                }
                return updatedField;
            }
            return f;
        });

        newFields.sort((a, b) => a.order - b.order);
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
    const defaultLength = dataType === 'Alfanumérico' ? correspondingMapping?.length : undefined;

    const newOutputField: OutputFieldConfig = {
        id: `mapped-${newFieldId}-${Date.now()}`,
        isStatic: false,
        mappedField: newFieldId,
        order: maxOrder + 1,
        ...(outputConfig.format === 'txt' && {
             length: defaultLength ?? 10,
             paddingChar: getDefaultPaddingChar({isStatic: false, mappedField: newFieldId, id: '', order: 0 }, columnMappings),
             paddingDirection: getDefaultPaddingDirection({isStatic: false, mappedField: newFieldId, id: '', order: 0 }, columnMappings),
         }),
        dateFormat: dataType === 'Data' ? 'YYYYMMDD' : undefined,
    };

    setOutputConfig(prev => ({
        ...prev,
        fields: [...prev.fields, newOutputField].sort((a, b) => a.order - b.order)
    }));
};


  const removeOutputField = (idToRemove: string) => {
     setOutputConfig(prev => {
         const newFields = prev.fields.filter(f => f.id !== idToRemove);
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
        if (!field.isStatic) return;
        setStaticFieldDialogState({
            isOpen: true,
            isEditing: true,
            fieldId: field.id,
            fieldName: field.fieldName,
            staticValue: field.staticValue,
            length: String(field.length ?? ''),
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
             id: isEditing && fieldId ? fieldId : `static-${Date.now()}`,
             isStatic: true,
             fieldName: fieldName.trim(),
             staticValue: staticValue,
             order: 0,
             ...(outputConfig.format === 'txt' && {
                length: len,
                paddingChar: paddingChar,
                paddingDirection: paddingDirection,
            }),
         };


        setOutputConfig(prev => {
            let newFields;
            if (isEditing) {
                 const existingFieldIndex = prev.fields.findIndex(f => f.id === fieldId);
                 if (existingFieldIndex === -1) return prev;
                 newFields = [...prev.fields];
                  const updatedStaticField = { ...staticField, order: prev.fields[existingFieldIndex].order };
                  if (prev.format === 'txt') {
                     updatedStaticField.length = len;
                     updatedStaticField.paddingChar = paddingChar;
                     updatedStaticField.paddingDirection = paddingDirection;
                  } else {
                      updatedStaticField.length = len;
                      updatedStaticField.paddingChar = paddingChar;
                      updatedStaticField.paddingDirection = paddingDirection;
                  }

                 newFields[existingFieldIndex] = updatedStaticField;

            } else {
                 const maxOrder = prev.fields.length > 0 ? Math.max(...prev.fields.map(f => f.order)) : -1;
                 staticField.order = maxOrder + 1;
                 newFields = [...prev.fields, staticField];
            }
             newFields.sort((a, b) => a.order - b.order);
             const reorderedFields = newFields.map((f, idx) => ({ ...f, order: idx }));

            return { ...prev, fields: reorderedFields };
        });

        setStaticFieldDialogState({ ...staticFieldDialogState, isOpen: false });
        toast({ title: "Sucesso", description: `Campo estático "${fieldName.trim()}" ${isEditing ? 'atualizado' : 'adicionado'}.` });
    };


 // Effect to initialize/update output fields based on mapped fields and format changes
   useEffect(() => {
       if (columnMappings.length === 0 && fileData.length === 0) return;

       setOutputConfig(prevConfig => {
           const existingFieldsMap = new Map(prevConfig.fields.map(f => [f.isStatic ? f.id : f.mappedField, f]));

           const potentialMappedFields = columnMappings
               .filter(m => m.mappedField !== null)
               .map((m, index) => {
                   const dataType = m.dataType ?? null;
                   const fieldId = `mapped-${m.mappedField!}-${index}`;
                   const existingField = existingFieldsMap.get(m.mappedField!) as OutputFieldConfig | undefined;

                    let baseField: Omit<OutputFieldConfig, 'id' | 'order' | 'isStatic' | 'mappedField'> & { mappedField: string, isStatic: false } = {
                       isStatic: false,
                       mappedField: m.mappedField!,
                       length: existingField?.length ?? (dataType === 'Alfanumérico' ? (m.length ?? undefined) : undefined),
                       paddingChar: existingField?.paddingChar ?? undefined,
                       paddingDirection: existingField?.paddingDirection ?? undefined,
                       dateFormat: existingField?.dateFormat ?? (dataType === 'Data' ? 'YYYYMMDD' : undefined),
                    };

                   if (prevConfig.format === 'txt') {
                        baseField.length = baseField.length ?? 10;
                        baseField.paddingChar = baseField.paddingChar ?? getDefaultPaddingChar(baseField, columnMappings);
                        baseField.paddingDirection = baseField.paddingDirection ?? getDefaultPaddingDirection(baseField, columnMappings);
                   } else {
                       if (existingField?.length === undefined) delete baseField.length;
                       if (existingField?.paddingChar === undefined) delete baseField.paddingChar;
                       if (existingField?.paddingDirection === undefined) delete baseField.paddingDirection;
                   }
                    if (dataType !== 'Data' && existingField?.dateFormat === undefined) {
                       delete baseField.dateFormat;
                    } else if (dataType === 'Data') {
                        baseField.dateFormat = baseField.dateFormat ?? 'YYYYMMDD';
                    }


                   return {
                        ...baseField,
                        id: existingField?.id ?? fieldId,
                        order: existingField?.order ?? (prevConfig.fields.length + index)
                   };
               });


           const uniqueMappedFields = potentialMappedFields.reduce((acc, current) => {
               const existingIndex = acc.findIndex(item => !item.isStatic && item.mappedField === current.mappedField);
                if (existingIndex === -1) {
                   acc.push(current);
               } else if (current.order < acc[existingIndex].order) {
                    acc[existingIndex] = current;
               }
               return acc;
           }, [] as (OutputFieldConfig & {isStatic: false})[]);

            const updatedStaticFields = prevConfig.fields
                .filter((f): f is OutputFieldConfig & { isStatic: true } => f.isStatic)
                .map(f => {
                    if (prevConfig.format === 'txt') {
                        return {
                            ...f,
                            length: f.length ?? f.staticValue?.length ?? 10,
                            paddingChar: f.paddingChar ?? getDefaultPaddingChar(f, columnMappings),
                            paddingDirection: f.paddingDirection ?? getDefaultPaddingDirection(f, columnMappings),
                        };
                    } else {
                         return {
                             ...f,
                         };
                    }
                });


            let combinedFields: OutputFieldConfig[] = [
               ...updatedStaticFields,
               ...uniqueMappedFields
           ];

            combinedFields = combinedFields.filter(field =>
               field.isStatic || columnMappings.some(cm => cm.mappedField === field.mappedField)
           );


           combinedFields.sort((a, b) => a.order - b.order);
           const reorderedFinalFields = combinedFields.map((f, idx) => ({ ...f, order: idx }));


            const hasChanged = JSON.stringify(prevConfig.fields) !== JSON.stringify(reorderedFinalFields);

           if (hasChanged) {
               return {
                   ...prevConfig,
                   fields: reorderedFinalFields
               };
           } else {
               return prevConfig;
           }
       });
   }, [columnMappings, fileData, outputConfig.format]);


  // --- Conversion ---
  const convertFile = () => {
    setIsProcessing(true);
    setProcessingMessage('Convertendo arquivo...');
    setConvertedData('');

    if (!fileData && outputConfig.fields.every(f => f.isStatic === false)) {
        toast({ title: "Erro", description: "Nenhum dado de entrada ou campo mapeado para converter.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
     if (outputConfig.fields.length === 0) {
         toast({ title: "Erro", description: "Configure os campos de saída antes de converter.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    const mappedOutputFields = outputConfig.fields.filter(f => !f.isStatic);
    const requiredMappings = columnMappings.filter(m => mappedOutputFields.some(f => !f.isStatic && f.mappedField === m.mappedField));

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
    if (outputConfig.fields.some(f => !f.isStatic && columnMappings.find(cm => cm.mappedField === f.mappedField)?.dataType === 'Data' && !f.dateFormat)) {
        toast({ title: "Erro", description: "Selecione um 'Formato Data' para todos os campos do tipo Data na saída.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }


    try {
      let resultString = '';
      const sortedOutputFields = [...outputConfig.fields].sort((a, b) => a.order - b.order);

      const dataToProcess = fileData && fileData.length > 0 ? fileData : [{}];

      dataToProcess.forEach(row => {
        let line = '';
        sortedOutputFields.forEach((outputField, fieldIndex) => {
          let value = '';
          let mapping: ColumnMapping | undefined;
          let dataType: DataType | null = null;
          let originalValue: any = null;

          if (outputField.isStatic) {
             value = outputField.staticValue ?? '';
             originalValue = value;
             dataType = /^-?\d+([.,]\d+)?$/.test(value) ? 'Numérico' : 'Alfanumérico';
          } else {
             mapping = columnMappings.find(m => m.mappedField === outputField.mappedField);
             if (!mapping || !mapping.originalHeader || !fileData || fileData.length === 0) {
                 if(fileData && fileData.length > 0) console.warn(`Mapeamento não encontrado para o campo de saída: ${outputField.mappedField}`);
                 value = '';
             } else {
                 originalValue = row[mapping.originalHeader] ?? '';
                 value = String(originalValue).trim();
                 dataType = mapping.dataType;

                  if (mapping.removeMask && dataType && value) {
                      value = removeMaskHelper(value, dataType);
                  }


                 switch (dataType) {
                      case 'CPF':
                      case 'CNPJ':
                      case 'Inteiro':
                            if (!mapping.removeMask && value) value = value.replace(/\D/g, '');
                           break;
                      case 'Numérico':
                            const numStr = value.replace(',', '.');
                            const numMatch = numStr.match(/^(-?\d+\.?\d*)|(^-?\.\d+)/);

                            if (numMatch && numMatch[0]) {
                                let numVal = parseFloat(numMatch[0]);
                                if (isNaN(numVal)) {
                                    value = '0.00';
                                } else {
                                    value = numVal.toFixed(2);
                                }
                            } else if (value === '0' || value === '') {
                                value = '0.00';
                            }
                             else {
                                 console.warn(`Could not parse numeric value: ${originalValue} (processed: ${value}). Defaulting to 0.00`);
                                value = '0.00';
                            }
                          break;
                       case 'Data':
                            try {
                                let parsedDate: Date | null = null;
                                let cleanedValue = value;

                                if (!mapping?.removeMask && value) {
                                    cleanedValue = value.replace(/[^\d]/g, '');
                                }

                                let year = '', month = '', day = '';

                                if (cleanedValue.length === 8) {
                                    const part1 = cleanedValue.substring(0, 2);
                                    const part2 = cleanedValue.substring(2, 4);
                                    const part3 = cleanedValue.substring(4, 8);
                                    const part4 = cleanedValue.substring(0, 4);
                                    const part5 = cleanedValue.substring(4, 6);
                                    const part6 = cleanedValue.substring(6, 8);

                                    if (parseInt(part4) > 1900 && parseInt(part4) < 2100 && parseInt(part5) >= 1 && parseInt(part5) <= 12 && parseInt(part6) >= 1 && parseInt(part6) <= 31) {
                                        year = part4; month = part5; day = part6;
                                    }
                                    else if (parseInt(part1) >= 1 && parseInt(part1) <= 31 && parseInt(part2) >= 1 && parseInt(part2) <= 12 && parseInt(part3) > 1900 && parseInt(part3) < 2100) {
                                        day = part1; month = part2; year = part3;
                                    }
                                     else if (parseInt(part1) >= 1 && parseInt(part1) <= 12 && parseInt(part2) >= 1 && parseInt(part2) <= 31 && parseInt(part3) > 1900 && parseInt(part3) < 2100) {
                                          month = part1; day = part2; year = part3;
                                     }
                                } else if (cleanedValue.length === 6) {
                                    const part1 = cleanedValue.substring(0, 2);
                                    const part2 = cleanedValue.substring(2, 4);
                                    const part3 = cleanedValue.substring(4, 6);
                                     if(parseInt(part1) >= 1 && parseInt(part1) <= 31 && parseInt(part2) >= 1 && parseInt(part2) <= 12) {
                                         day = part1; month = part2; year = part3;
                                     }
                                      if (year.length === 2) {
                                        year = (parseInt(year) < 70 ? '20' : '19') + year;
                                      }
                                }

                                 if (!year && originalValue) {
                                     const dateString = String(originalValue).trim();
                                     const datePartsSlash = dateString.split('/');
                                     const datePartsDash = dateString.split('-');

                                     if (datePartsSlash.length === 3) {
                                         if (datePartsSlash[2].length === 4) {
                                             day = datePartsSlash[0]; month = datePartsSlash[1]; year = datePartsSlash[2];
                                         } else if (datePartsSlash[0].length === 4) {
                                             year = datePartsSlash[0]; month = datePartsSlash[1]; day = datePartsSlash[2];
                                         } else if (datePartsSlash[2].length === 2) {
                                             day = datePartsSlash[0]; month = datePartsSlash[1]; year = datePartsSlash[2];
                                              if(year.length === 2) year = (parseInt(year) < 70 ? '20' : '19') + year;
                                         }
                                     } else if (datePartsDash.length === 3) {
                                         if (datePartsDash[0].length === 4) {
                                             year = datePartsDash[0]; month = datePartsDash[1]; day = datePartsDash[2];
                                         } else if (datePartsDash[2].length === 4) {
                                             day = datePartsDash[0]; month = datePartsDash[1]; year = datePartsDash[2];
                                         } else if (datePartsDash[2].length === 2) {
                                             day = datePartsDash[0]; month = datePartsDash[1]; year = datePartsDash[2];
                                             if(year.length === 2) year = (parseInt(year) < 70 ? '20' : '19') + year;
                                         }
                                     }
                                 }


                                if (year && month && day && parseInt(year) > 0 && parseInt(month) >= 1 && parseInt(month) <= 12 && parseInt(day) >= 1 && parseInt(day) <= 31) {
                                    const paddedMonth = month.padStart(2, '0');
                                    const paddedDay = day.padStart(2, '0');
                                    parsedDate = new Date(Date.UTC(parseInt(year), parseInt(paddedMonth) - 1, parseInt(paddedDay)));

                                    if (!parsedDate || isNaN(parsedDate.getTime()) || parsedDate.getUTCFullYear() !== parseInt(year) || (parsedDate.getUTCMonth() + 1) !== parseInt(paddedMonth) || parsedDate.getUTCDate() !== parseInt(paddedDay) ) {
                                         parsedDate = null;
                                         if (year && month && day) console.warn(`Validação de data falhou para partes: D=${day}, M=${month}, Y=${year}`);
                                    }
                                } else if (year || month || day) {
                                     console.warn(`Partes de data inválidas extraídas: D=${day}, M=${month}, Y=${year}`);
                                }


                                if ((!parsedDate || isNaN(parsedDate.getTime())) && originalValue) {
                                    if (String(originalValue).trim() && /[0-9]/.test(String(originalValue))) {
                                        let attemptOriginalParse = new Date(originalValue);
                                         if (attemptOriginalParse && !isNaN(attemptOriginalParse.getTime()) && attemptOriginalParse.getFullYear() > 1000 && attemptOriginalParse.getFullYear() < 3000) {
                                            parsedDate = attemptOriginalParse;
                                            console.log("Data analisada usando fallback:", parsedDate);
                                        } else {
                                             console.warn(`Análise de data de fallback falhou ou resultou em data inválida para: ${originalValue}`);
                                        }
                                    }
                                }


                                if (parsedDate && !isNaN(parsedDate.getTime())) {
                                     const useUTC = parsedDate.getUTCHours() === 0 && parsedDate.getUTCMinutes() === 0;
                                     const y = useUTC ? parsedDate.getUTCFullYear() : parsedDate.getFullYear();
                                     const m = String((useUTC ? parsedDate.getUTCMonth() : parsedDate.getMonth()) + 1).padStart(2, '0');
                                     const d = String(useUTC ? parsedDate.getUTCDate() : parsedDate.getDate()).padStart(2, '0');

                                    const dateFormat = outputField.dateFormat || 'YYYYMMDD';

                                     value = dateFormat === 'YYYYMMDD' ? `${y}${m}${d}` : `${d}${m}${y}`;
                                } else if (value) {
                                    console.warn(`Não foi possível analisar a data: ${originalValue} (limpo: ${cleanedValue}). Gerando vazio.`);
                                    value = '';
                                } else {
                                    value = '';
                                }

                            } catch (e) {
                                console.error(`Erro ao processar data: ${originalValue}`, e);
                                value = '';
                            }
                            break;
                      case 'Alfanumérico':
                      default:
                          break;
                 }
             }
          }


          // --- Apply Output Formatting (TXT Padding or CSV Delimiting) ---
          if (outputConfig.format === 'txt') {
             const len = outputField.length ?? 0;
             const padChar = outputField.paddingChar || getDefaultPaddingChar(outputField, columnMappings);
             const padDir = outputField.paddingDirection || getDefaultPaddingDirection(outputField, columnMappings);
             let processedValue = String(value ?? '');

             if (len > 0) {
                 if (processedValue.length > len) {
                      console.warn(`Truncando valor "${processedValue}" para o campo ${outputField.isStatic ? outputField.fieldName : outputField.mappedField} pois excede o tamanho ${len}`);
                      if (padDir === 'left' && (dataType === 'Numérico' || dataType === 'Inteiro' || (outputField.isStatic && /^-?\d/.test(processedValue)))) {
                          const isNegative = processedValue.startsWith('-');
                          const absValue = isNegative ? processedValue.substring(1) : processedValue;
                           const targetLength = isNegative ? len - 1 : len;

                           if (targetLength <= 0) {
                               processedValue = isNegative ? '-' : '';
                               if (processedValue.length > len) processedValue = processedValue.substring(0, len);
                           } else {
                               const truncatedAbs = absValue.substring(absValue.length - targetLength);
                               processedValue = isNegative ? '-' + truncatedAbs : truncatedAbs;
                           }

                      } else {
                         processedValue = processedValue.substring(0, len);
                      }

                 } else if (processedValue.length < len) {
                     const padLen = len - processedValue.length;
                     if (padDir === 'left') {
                         if (processedValue.startsWith('-') && padChar === '0') {
                             processedValue = '-' + padChar.repeat(padLen) + processedValue.substring(1);
                         } else {
                             processedValue = padChar.repeat(padLen) + processedValue;
                         }
                     } else {
                         processedValue = processedValue + padChar.repeat(padLen);
                     }
                 }
                  if (processedValue.length > len) {
                       console.warn(`Re-truncando valor "${processedValue}" para o tamanho ${len} após preenchimento`);
                       if (padDir === 'left') {
                           processedValue = processedValue.slice(-len);
                       } else {
                            processedValue = processedValue.slice(0, len);
                       }

                  } else if (processedValue.length < len && padDir === 'left') {
                       processedValue = padChar.repeat(len - processedValue.length) + processedValue;
                  }


             } else {
                 processedValue = '';
             }


             line += processedValue;

          } else if (outputConfig.format === 'csv') {
            if (fieldIndex > 0) {
              line += outputConfig.delimiter;
            }
             let csvValue = String(value ?? '');
              if (dataType === 'Numérico') {
                    csvValue = csvValue.replace('.', ',');
              }

             const needsQuotes = csvValue.includes(outputConfig.delimiter!) || csvValue.includes('"') || csvValue.includes('\n');
             if (needsQuotes) {
                csvValue = `"${csvValue.replace(/"/g, '""')}"`;
            }
            line += csvValue;
          }
        });
        resultString += line + '\n';
      });

        const resultBuffer = iconv.encode(resultString.trimEnd(), outputEncoding);
        setConvertedData(resultBuffer);

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
      setProcessingMessage('Processando...');
    }
  };

   const openDownloadDialog = () => {
        if (!convertedData) return;
        const proposed = `${fileName.split('.').slice(0, -1).join('.')}_convertido.${outputConfig.format}`;
        setDownloadDialogState({
            isOpen: true,
            proposedFilename: proposed,
            finalFilename: proposed,
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

         const blob = convertedData instanceof Buffer
             ? new Blob([convertedData], { type: mimeType })
             : new Blob([String(convertedData)], { type: mimeType });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename.endsWith(`.${outputConfig.format}`) ? finalFilename : `${finalFilename}.${outputConfig.format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: "Download Iniciado", description: `Arquivo ${link.download} sendo baixado.`});
        setDownloadDialogState({ isOpen: false, proposedFilename: '', finalFilename: '' });
    };

  // Memoized list of predefined fields available for mapping dropdowns
  const memoizedPredefinedFields = useMemo(() => {
      return [...predefinedFields] // Create a copy before sorting
          .sort((a, b) => {
              // Prioritize core fields, then sort alphabetically
              if (a.isCore && !b.isCore) return -1;
              if (!a.isCore && b.isCore) return 1;
              return a.name.localeCompare(b.name);
          });
  }, [predefinedFields]);


 // Render helper for Output Field selection for MAPPED fields
 const renderMappedOutputFieldSelect = (currentField: OutputFieldConfig) => {
     if (currentField.isStatic) return null;

     const currentFieldMappedId = currentField.mappedField;
     const availableOptions = memoizedPredefinedFields
         .filter(pf =>
             columnMappings.some(cm => cm.mappedField === pf.id)
         )
         .filter(pf =>
              pf.id === currentFieldMappedId ||
              !outputConfig.fields.some(of => !of.isStatic && of.mappedField === pf.id)
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
                      <SelectItem value={NONE_VALUE_PLACEHOLDER} disabled>Nenhum campo mapeado</SelectItem>
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
                        className="hidden"
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
              {isProcessing && activeTab === "mapping" && (
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

                        <div className="max-h-[45vh] overflow-auto">
                           <Table>
                             <TableHeader>
                               <TableRow>
                                 <TableHead className="w-[22%]">Coluna Original</TableHead>
                                 <TableHead className="w-[22%]">Mapear para Campo</TableHead>
                                 <TableHead className="w-[18%]">Tipo</TableHead>
                                 <TableHead className="w-[10%]">
                                     Tam.
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                 <Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Opcional. Define o tamanho máx.</p>
                                                <p>Usado para definir o tamanho na saída TXT.</p>
                                                <p>(Ignorado para tipos não-Alfanuméricos).</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                 </TableHead>
                                 <TableHead className="w-[20%] text-center">
                                     Remover Máscara
                                      <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                 <Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Remove caracteres não numéricos/separadores.</p>
                                                <p>Útil para CPF, CNPJ, Data, Numérico etc.</p>
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
                                            <div className="flex items-center gap-1">
                                                 <Select
                                                   value={mapping.mappedField || NONE_VALUE_PLACEHOLDER}
                                                   onValueChange={(value) => handleMappingChange(index, 'mappedField', value)}
                                                    disabled={isProcessing}
                                                 >
                                                   <SelectTrigger className="text-xs h-8 flex-grow">
                                                     <SelectValue placeholder="Selecione ou deixe em branco" />
                                                   </SelectTrigger>
                                                   <SelectContent>
                                                     <SelectItem value={NONE_VALUE_PLACEHOLDER}>-- Sem mapeamento --</SelectItem>
                                                     {memoizedPredefinedFields.map(field => (
                                                       <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>
                                                     ))}
                                                   </SelectContent>
                                                 </Select>
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
                                           disabled={isProcessing || !mapping.mappedField}
                                         >
                                           <SelectTrigger className="text-xs h-8">
                                             <SelectValue placeholder="Tipo (Obrigatório se mapeado)" />
                                           </SelectTrigger>
                                           <SelectContent>
                                             <SelectItem value={NONE_VALUE_PLACEHOLDER} disabled>-- Selecione --</SelectItem>
                                             {DATA_TYPES.map(type => (
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
                                           placeholder="Tam."
                                           className="w-full text-xs h-8"
                                           disabled={isProcessing || !mapping.dataType || mapping.dataType !== 'Alfanumérico'}
                                         />
                                       </TableCell>
                                        <TableCell className="text-center">
                                          <Switch
                                              checked={mapping.removeMask}
                                              onCheckedChange={(checked) => handleMappingChange(index, 'removeMask', checked)}
                                              disabled={isProcessing || !mapping.dataType || mapping.dataType === 'Alfanumérico'}
                                              aria-label={`Remover máscara para ${mapping.originalHeader}`}
                                              className="scale-75"
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
                         <CardDescription>Adicione, edite ou remova campos para o mapeamento. Campos Principais são mantidos para futuras conversões.</CardDescription>
                     </CardHeader>
                      <CardContent>
                         <div className="flex justify-end mb-4">
                             <Button onClick={openAddPredefinedFieldDialog} disabled={isProcessing} variant="outline">
                                 <Plus className="mr-2 h-4 w-4" /> Adicionar Novo Campo
                             </Button>
                         </div>
                         <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2 bg-secondary/30">
                              {memoizedPredefinedFields.map(field => (
                                 <div key={field.id} className="flex items-center justify-between p-2 border-b last:border-b-0 gap-2">
                                     <div className="flex items-center gap-1 flex-wrap flex-grow">
                                         <span className="text-sm font-medium">{field.name}</span>
                                         <span className="text-xs text-muted-foreground">({field.id})</span>
                                          {/* Display "Principal" or "Opcional" */}
                                          <span className={`ml-1 text-xs ${field.isPersistent ? 'text-green-600 font-semibold' : 'text-yellow-600'}`}>
                                             ({field.isPersistent ? 'Principal' : 'Opcional'})
                                           </span>
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
                                     <div className="flex gap-1 flex-shrink-0">
                                           <TooltipProvider>
                                               <Tooltip>
                                                   <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => openEditPredefinedFieldDialog(field)}
                                                            disabled={isProcessing}
                                                            className="h-7 w-7 text-muted-foreground hover:text-accent"
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
                                                             disabled={isProcessing} // Allow removing any field now
                                                             className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:text-muted-foreground/50 disabled:cursor-not-allowed"
                                                             aria-label={`Remover campo ${field.name}`}
                                                         >
                                                             <Trash2 className="h-4 w-4" />
                                                         </Button>
                                                    </TooltipTrigger>
                                                   <TooltipContent>
                                                         <p>Remover campo "{field.name}"</p>
                                                   </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                       </div>
                                 </div>
                             ))}
                             {memoizedPredefinedFields.length === 0 && <p className="text-sm text-muted-foreground text-center p-2">Nenhum campo pré-definido encontrado.</p>}
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
              {isProcessing && activeTab === "config" && (
                 <div className="flex items-center justify-center text-accent animate-pulse p-4">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {processingMessage}
                  </div>
               )}
               {!isProcessing && file && (
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
                                                   <TableHead className="w-2/12">Formato Data</TableHead>
                                                  {outputConfig.format === 'txt' && (
                                                      <>
                                                          <TableHead className="w-[80px]">
                                                              Tam.
                                                              <TooltipProvider>
                                                                  <Tooltip>
                                                                      <TooltipTrigger asChild><Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger>
                                                                      <TooltipContent><p>Tamanho fixo (obrigatório).</p></TooltipContent>
                                                                  </Tooltip>
                                                              </TooltipProvider>
                                                          </TableHead>
                                                           <TableHead className="w-[80px]">
                                                              Preench.
                                                               <TooltipProvider>
                                                                  <Tooltip>
                                                                      <TooltipTrigger asChild><Button variant="ghost" size="icon" className="ml-1 h-6 w-6 text-muted-foreground cursor-help align-middle"><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger>
                                                                      <TooltipContent><p>Caractere (1) p/ preencher.</p></TooltipContent>
                                                                  </Tooltip>
                                                              </TooltipProvider>
                                                           </TableHead>
                                                           <TableHead className="w-2/12">
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
                                                 const mappedFieldName = !field.isStatic ? predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? field.mappedField : '';

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
                                                             aria-label={`Ordem do campo ${field.isStatic ? field.fieldName : mappedFieldName}`}
                                                         />
                                                      </TableCell>
                                                     <TableCell className="text-xs">
                                                         {field.isStatic ? (
                                                             <div className="flex items-center gap-1">
                                                                <span className="font-medium text-blue-600 dark:text-blue-400" title={`Valor: ${field.staticValue}`}>{field.fieldName} (Estático)</span>
                                                                 <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-accent" onClick={() => openEditStaticFieldDialog(field)} aria-label={`Editar campo estático ${field.fieldName}`}>
                                                                     <Edit className="h-3 w-3" />
                                                                 </Button>
                                                             </div>
                                                         ) : (
                                                            renderMappedOutputFieldSelect(field)
                                                         )}
                                                     </TableCell>
                                                     <TableCell>
                                                          <Select
                                                               value={field.dateFormat ?? ''}
                                                               onValueChange={(value) => handleOutputFieldChange(field.id, 'dateFormat', value)}
                                                               disabled={isProcessing || !isDateField}
                                                            >
                                                                <SelectTrigger className={`w-full h-8 text-xs ${!isDateField ? 'invisible' : ''}`}>
                                                                    <SelectValue placeholder="Formato Data" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="YYYYMMDD">AAAAMMDD</SelectItem>
                                                                    <SelectItem value="DDMMYYYY">DDMMAAAA</SelectItem>
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
                                                                 aria-label={`Tamanho do campo ${field.isStatic ? field.fieldName : mappedFieldName}`}
                                                             />
                                                          </TableCell>
                                                          <TableCell>
                                                             <Input
                                                                type="text"
                                                                maxLength={1}
                                                                value={field.paddingChar ?? ''}
                                                                onChange={(e) => handleOutputFieldChange(field.id, 'paddingChar', e.target.value)}
                                                                 placeholder={getDefaultPaddingChar(field, columnMappings)}
                                                                className="w-10 text-center h-8 text-xs"
                                                                 required
                                                                disabled={isProcessing}
                                                                aria-label={`Caractere de preenchimento do campo ${field.isStatic ? field.fieldName : mappedFieldName}`}
                                                             />
                                                         </TableCell>
                                                         <TableCell>
                                                              <Select
                                                                  value={field.paddingDirection ?? getDefaultPaddingDirection(field, columnMappings)}
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
                                                                             aria-label={`Remover campo ${field.isStatic ? field.fieldName : mappedFieldName} da saída`}
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
               {isProcessing && activeTab === "result" && (
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
                                 value={convertedData instanceof Buffer
                                          ? iconv.decode(convertedData, outputEncoding)
                                          : String(convertedData) }
                                 className="w-full h-64 font-mono text-xs bg-secondary/30 border rounded-md"
                                 placeholder="Resultado da conversão aparecerá aqui..."
                                 aria-label="Pré-visualização do arquivo convertido"
                             />
                         </CardContent>
                         <CardFooter className="flex flex-col sm:flex-row justify-between gap-2">
                             <Button variant="outline" onClick={() => setActiveTab("config")} disabled={isProcessing}>Voltar à Configuração</Button>
                            <div className="flex gap-2">
                                 <Button onClick={resetState} variant="outline" className="mr-2" disabled={isProcessing}>
                                     <RotateCcw className="mr-2 h-4 w-4" /> Nova Conversão {/* Changed Icon */}
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

         {/* Updated Footer */}
        <CardFooter className="text-center text-xs text-muted-foreground pt-4 border-t flex flex-col sm:flex-row justify-between items-center gap-2">
             <span className="text-left">
                 © {new Date().getFullYear()} SCA. Ferramenta de conversão de dados. - Desenvolvido por <a href="mailto:faraujo@gmail.com" className="text-accent hover:underline">Fábio Araújo</a>
             </span>
             <span className="font-mono text-accent text-right">v{appVersion}</span>
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
                {/* Improved Layout for Dialog */}
                 <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="static-field-name">Nome*</Label>
                        <Input
                            id="static-field-name"
                            value={staticFieldDialogState.fieldName}
                            onChange={(e) => handleStaticFieldDialogChange('fieldName', e.target.value)}
                            placeholder="Ex: FlagAtivo"
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="static-field-value">Valor</Label>
                        <Input
                            id="static-field-value"
                            value={staticFieldDialogState.staticValue}
                            onChange={(e) => handleStaticFieldDialogChange('staticValue', e.target.value)}
                            placeholder="Ex: S ou 001001"
                        />
                    </div>
                     {outputConfig.format === 'txt' && (
                         <>
                            <div className="space-y-2">
                                <Label htmlFor="static-field-length">Tamanho* (TXT)</Label>
                                <Input
                                    id="static-field-length"
                                    type="number"
                                    min="1"
                                    value={staticFieldDialogState.length}
                                    onChange={(e) => handleStaticFieldDialogChange('length', e.target.value)}
                                    required
                                    placeholder="Obrigatório para TXT"
                                />
                             </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="static-field-padding-char">Preencher* (TXT)</Label>
                                    <Input
                                        id="static-field-padding-char"
                                        type="text"
                                        maxLength={1}
                                        value={staticFieldDialogState.paddingChar}
                                        onChange={(e) => handleStaticFieldDialogChange('paddingChar', e.target.value)}
                                        className="text-center"
                                        required
                                        placeholder={/^-?\d+$/.test(staticFieldDialogState.staticValue) ? '0' : ' '}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="static-field-padding-direction">Direção* (TXT)</Label>
                                     <Select
                                           value={staticFieldDialogState.paddingDirection}
                                           onValueChange={(value) => handleStaticFieldDialogChange('paddingDirection', value)}
                                           disabled={isProcessing}
                                        >
                                           <SelectTrigger id="static-field-padding-direction">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                 <SelectItem value="left">Esquerda</SelectItem>
                                                 <SelectItem value="right">Direita</SelectItem>
                                             </SelectContent>
                                      </Select>
                                  </div>
                             </div>
                         </>
                     )}
                      <p className="text-xs text-muted-foreground">* Campos obrigatórios.</p>
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
                             ? "Edite as propriedades do campo pré-definido."
                             : "Adicione um novo campo para usar no mapeamento."}
                          Defina se o campo será Principal (mantido para futuras conversões) ou Opcional.
                     </DialogDescription>
                 </DialogHeader>
                 {/* Improved Layout */}
                 <div className="grid gap-4 py-4">
                     <div className="space-y-2">
                         <Label htmlFor="predefined-field-name">Nome*</Label>
                         <Input
                             id="predefined-field-name"
                             value={predefinedFieldDialogState.fieldName}
                             onChange={(e) => handlePredefinedFieldDialogChange('fieldName', e.target.value)}
                             placeholder="Ex: Código do Cliente"
                             required
                         />
                     </div>
                     <div className="space-y-2">
                         <Label htmlFor="predefined-field-comment">Comentário</Label>
                         <Textarea
                             id="predefined-field-comment"
                             value={predefinedFieldDialogState.comment}
                             onChange={(e) => handlePredefinedFieldDialogChange('comment', e.target.value)}
                             className="min-h-[60px]"
                             placeholder="Opcional: Descrição curta ou instrução de uso (ex: Usar apenas números)"
                         />
                     </div>
                     <div className="flex items-center space-x-2 pt-2">
                         <Checkbox
                             id="predefined-persist"
                             checked={predefinedFieldDialogState.isPersistent}
                             onCheckedChange={(checked) => handlePredefinedFieldDialogChange('isPersistent', Boolean(checked))}
                             aria-label="Marcar como Campo Principal"
                             // disabled={predefinedFields.find(f => f.id === predefinedFieldDialogState.fieldId)?.isCore} // Core fields are always persistent
                         />
                         <Label htmlFor="predefined-persist" className="cursor-pointer">
                             Campo Principal (Manter para futuras conversões)
                         </Label>
                          <TooltipProvider>
                               <Tooltip>
                                   <TooltipTrigger asChild>
                                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                                   </TooltipTrigger>
                                   <TooltipContent>
                                       <p>Campos Principais são salvos no seu navegador e ficam disponíveis para todas as conversões.</p>
                                       <p>Campos Opcionais são usados apenas nesta conversão.</p>
                                   </TooltipContent>
                               </Tooltip>
                           </TooltipProvider>
                     </div>
                     <p className="text-xs text-muted-foreground">* Nome é obrigatório.</p>
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
                {/* Improved Layout */}
                <div className="space-y-4 py-4">
                   <div className="space-y-2">
                        <Label htmlFor="download-filename">Nome do Arquivo</Label>
                        <Input
                            id="download-filename"
                            value={downloadDialogState.finalFilename}
                            onChange={handleDownloadFilenameChange}
                            placeholder="Nome do arquivo de saída"
                        />
                   </div>
                    <p className="text-xs text-muted-foreground">A extensão (.txt ou .csv) será adicionada automaticamente.</p>
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
