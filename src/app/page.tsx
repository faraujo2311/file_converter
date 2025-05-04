
"use client";

import React, { useState, useCallback, useEffect } from 'react';
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
import { Upload, FileText, FileSpreadsheet, Settings, ArrowRight, Trash2, Plus, HelpCircle, Columns, Edit, Code } from 'lucide-react'; // Added Edit, Code
import { useToast } from "@/hooks/use-toast";
import { Textarea } from '@/components/ui/textarea';
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog"; // Import Dialog components

// Define types
type DataType = 'Inteiro' | 'Alfanumérico' | 'Numérico' | 'Contábil' | 'Data' | 'Texto' | 'CPF' | 'CNPJ'; // Added CNPJ
type PredefinedField = { id: string; name: string };
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


const PREDEFINED_FIELDS: PredefinedField[] = [
  { id: 'matricula', name: 'Matrícula' },
  { id: 'cpf', name: 'CPF' },
  { id: 'rg', name: 'RG' },
  { id: 'nome', name: 'Nome' },
  { id: 'email', name: 'E-mail' },
  { id: 'cnpj', name: 'CNPJ' }, // Added CNPJ to predefined if needed, or just use type
];

const DATA_TYPES: DataType[] = ['Inteiro', 'Alfanumérico', 'Numérico', 'Contábil', 'Data', 'Texto', 'CPF', 'CNPJ']; // Added CNPJ
const OUTPUT_ENCODINGS: OutputEncoding[] = ['UTF-8', 'ISO-8859-1', 'Windows-1252']; // Added encodings

const NONE_VALUE_PLACEHOLDER = "__NONE__";

// Helper to check if a data type is numeric-like
const isNumericType = (dataType: DataType | null): boolean => {
    return dataType === 'Inteiro' || dataType === 'Numérico' || dataType === 'Contábil' || dataType === 'CPF' || dataType === 'CNPJ';
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
    const num = Number(String(value).replace(/[^0-9.-]/g, '')); // Keep negative sign
    if (isNaN(num)) return '';
    return num.toFixed(decimals);
}

// Helper to remove mask based on type
const removeMask = (value: string, dataType: DataType | null): string => {
    if (!dataType) return value;

    switch (dataType) {
        case 'CPF':
        case 'CNPJ':
        case 'Inteiro':
        case 'Numérico':
            return value.replace(/\D/g, ''); // Remove all non-digits
        case 'Contábil':
             // Remove currency symbols, thousands separators, keep decimal comma/dot and negative sign
             return value.replace(/[R$.,\s]/g, '').replace(',', '.');
        case 'RG':
            return value.replace(/[.-]/g, ''); // Basic RG mask removal
        case 'Data':
            return value.replace(/\D/g, ''); // Remove slashes, dashes etc.
        default:
            return value;
    }
}


export default function Home() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileData, setFileData] = useState<any[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [outputConfig, setOutputConfig] = useState<OutputConfig>({ format: 'txt', fields: [] });
  const [predefinedFields, setPredefinedFields] = useState<PredefinedField[]>(PREDEFINED_FIELDS);
  const [newFieldName, setNewFieldName] = useState<string>('');
  const [convertedData, setConvertedData] = useState<string | Buffer>(''); // Can be string or Buffer
  const [outputEncoding, setOutputEncoding] = useState<OutputEncoding>('UTF-8'); // State for encoding
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
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

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'; // Get version

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
        resetState();
        return;
      }
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setHeaders([]);
      setFileData([]);
      setColumnMappings([]);
      setConvertedData('');
      setActiveTab("mapping"); // Move to mapping tab after file select
      processFile(selectedFile);
    }
  };

  const processFile = useCallback(async (fileToProcess: File) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        if (!data) {
          throw new Error("Falha ao ler o arquivo.");
        }

        let extractedHeaders: string[] = [];
        let extractedData: any[] = [];

        if (fileToProcess.type.includes('spreadsheet') || fileToProcess.type.includes('excel') || fileToProcess.name.endsWith('.ods')) {
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          // Read with raw: true initially to preserve original formatting for numeric types
          extractedData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

          if (extractedData.length > 0) {
             extractedHeaders = extractedData[0].map(String); // First row as headers
             extractedData = extractedData.slice(1).map(row => { // Remaining rows as data
               const rowData: { [key: string]: any } = {};
               extractedHeaders.forEach((header, index) => {
                 rowData[header] = row[index] ?? ''; // Use raw value or empty string
               });
               return rowData;
             });
          }
        } else if (fileToProcess.type === 'application/pdf') {
          toast({
            title: "Aviso",
            description: "A extração de PDF é experimental e pode não funcionar corretamente para todos os arquivos.",
            variant: "default",
          });
          // Placeholder - PDF extraction remains complex
          extractedHeaders = ['Coluna PDF 1', 'Coluna PDF 2'];
          extractedData = [{ 'Coluna PDF 1': 'Dado 1', 'Coluna PDF 2': 'Dado A' }, { 'Coluna PDF 1': 'Dado 2', 'Coluna PDF 2': 'Dado B' }];
        }

        if (extractedHeaders.length === 0) {
          throw new Error("Não foi possível extrair cabeçalhos do arquivo.");
        }

        setHeaders(extractedHeaders);
        setFileData(extractedData);
        setColumnMappings(extractedHeaders.map(header => {
            const guessedField = guessPredefinedField(header);
            const guessedType = guessDataType(header);
            return {
                originalHeader: header,
                mappedField: guessedField,
                dataType: guessedType,
                length: null,
                // Default mask removal for CPF/RG/CNPJ/Date
                removeMask: !!guessedField && ['cpf', 'rg', 'cnpj'].includes(guessedField) || guessedType === 'Data',
            }
        }));
      };
      reader.onerror = () => {
        throw new Error("Falha ao ler o arquivo.");
      };

      if (fileToProcess.type === 'application/pdf') {
        reader.readAsArrayBuffer(fileToProcess);
      } else {
        reader.readAsArrayBuffer(fileToProcess);
      }
    } catch (error: any) {
      console.error("Erro ao processar arquivo:", error);
      toast({
        title: "Erro ao Processar Arquivo",
        description: error.message || "Ocorreu um erro inesperado.",
        variant: "destructive",
      });
      resetState();
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  // --- Mapping ---
  const handleMappingChange = (index: number, field: keyof ColumnMapping, value: any) => {
    setColumnMappings(prev => {
      const newMappings = [...prev];
      const currentMapping = { ...newMappings[index] };
      let actualValue = value === NONE_VALUE_PLACEHOLDER ? null : value;

      if (field === 'dataType') {
         (currentMapping[field] as any) = actualValue;
         if (actualValue !== 'Alfanumérico' && actualValue !== 'Texto') {
           currentMapping.length = null; // Reset length if not text-based
         }
         // Set default mask removal based on type
         currentMapping.removeMask = ['CPF', 'RG', 'CNPJ', 'Data'].includes(actualValue ?? '');

       } else if (field === 'length') {
           const numValue = parseInt(value, 10);
           currentMapping.length = isNaN(numValue) || numValue <= 0 ? null : numValue;
       } else if (field === 'removeMask') {
           currentMapping.removeMask = Boolean(value); // Ensure boolean
       } else {
          (currentMapping[field] as any) = actualValue;
          // Auto-set data type if mapping to specific types and not already set
            if (field === 'mappedField' && actualValue && !currentMapping.dataType) {
                 if (actualValue === 'cpf') currentMapping.dataType = 'CPF';
                 else if (actualValue === 'cnpj') currentMapping.dataType = 'CNPJ';
                 else if (actualValue === 'rg') currentMapping.dataType = 'Alfanumérico'; // RG is often alphanumeric
                 // Add more specific types if needed
                 currentMapping.removeMask = ['cpf', 'cnpj', 'rg'].includes(actualValue) || currentMapping.dataType === 'Data';
            }
       }

      newMappings[index] = currentMapping;
      return newMappings;
    });
  };


  const guessPredefinedField = (header: string): string | null => {
      const lowerHeader = header.toLowerCase().trim();
      const guesses: { [key: string]: string[] } = {
          'matricula': ['matrícula', 'matricula', 'mat', 'registro', 'id func'],
          'cpf': ['cpf', 'cadastro pessoa física'],
          'rg': ['rg', 'identidade', 'registro geral'],
          'nome': ['nome', 'nome completo', 'funcionário', 'colaborador', 'name'],
          'email': ['email', 'e-mail', 'correio eletrônico', 'contato'],
          'cnpj': ['cnpj', 'cadastro nacional pessoa jurídica'], // Added CNPJ guess
      };

      for (const fieldId in guesses) {
          if (guesses[fieldId].some(keyword => lowerHeader.includes(keyword))) {
              return fieldId;
          }
      }
      return null; // No guess
  };

  const guessDataType = (header: string): DataType | null => {
      const lowerHeader = header.toLowerCase().trim();
      if (lowerHeader.includes('cnpj')) return 'CNPJ'; // Guess CNPJ first
      if (lowerHeader.includes('cpf')) return 'CPF';
      if (lowerHeader.includes('rg')) return 'Alfanumérico'; // RG can have letters
      if (lowerHeader.includes('data') || lowerHeader.includes('date') || lowerHeader.includes('nasc')) return 'Data'; // Expanded date guess
      if (lowerHeader.includes('valor') || lowerHeader.includes('salário') || lowerHeader.includes('contábil') || lowerHeader.includes('saldo') || lowerHeader.includes('preço')) return 'Contábil';
      if (lowerHeader.includes('num') || lowerHeader.includes('idade') || lowerHeader.includes('quant') || /^\d+(\.\d+)?$/.test(lowerHeader)) return 'Numérico'; // Include purely numeric headers
      if (lowerHeader.includes('matrícula') || lowerHeader.includes('código') || lowerHeader.includes('id') || /^\d+$/.test(lowerHeader)) return 'Inteiro'; // Guess integer for purely digit headers
      if (lowerHeader.includes('nome') || lowerHeader.includes('descrição') || lowerHeader.includes('texto') || lowerHeader.includes('obs')) return 'Texto';
      if (/[a-zA-Z]/.test(lowerHeader)) return 'Alfanumérico'; // Default to alphanumeric if letters present

      return null; // No guess
  }


  // --- Predefined Fields ---
  const addPredefinedField = () => {
    if (newFieldName.trim() === '') {
      toast({ title: "Erro", description: "Nome do campo não pode ser vazio.", variant: "destructive" });
      return;
    }
    const newId = newFieldName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''); // Sanitize ID
    if (!newId) {
        toast({ title: "Erro", description: "Nome do campo inválido para gerar um ID.", variant: "destructive" });
        return;
    }
    if (predefinedFields.some(f => f.id === newId)) {
      toast({ title: "Erro", description: `Já existe um campo com o ID gerado "${newId}". Escolha um nome diferente.`, variant: "destructive" });
      return;
    }
    setPredefinedFields([...predefinedFields, { id: newId, name: newFieldName.trim() }]);
    setNewFieldName('');
    toast({ title: "Sucesso", description: `Campo "${newFieldName.trim()}" adicionado com ID "${newId}".` });
  };

  const removePredefinedField = (idToRemove: string) => {
    const fieldToRemove = predefinedFields.find(f => f.id === idToRemove);
     const coreFields = ['matricula', 'cpf', 'rg', 'nome', 'email', 'cnpj']; // Include CNPJ
     if (fieldToRemove && coreFields.includes(idToRemove)) {
         toast({ title: "Aviso", description: `Não é possível remover o campo pré-definido "${fieldToRemove.name}".`, variant: "default" });
         return;
     }
     if (!fieldToRemove) return;

    setPredefinedFields(predefinedFields.filter(f => f.id !== idToRemove));
    // Update mappings that used this field
    setColumnMappings(prev => prev.map(m => m.mappedField === idToRemove ? { ...m, mappedField: null } : m));
    // Update output config (remove if it was a mapped field)
    setOutputConfig(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.isStatic || f.mappedField !== idToRemove),
    }));
    toast({ title: "Sucesso", description: `Campo "${fieldToRemove?.name}" removido.` });
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
                            updatedField.length = correspondingMapping?.length ?? 10;
                            updatedField.paddingChar = getDefaultPaddingChar(updatedField, columnMappings);
                            updatedField.paddingDirection = getDefaultPaddingDirection(updatedField, columnMappings);
                        }
                        if (dataType === 'Data') {
                            updatedField.dateFormat = updatedField.dateFormat ?? 'YYYYMMDD'; // Default date format
                        } else {
                            delete updatedField.dateFormat; // Remove if not a date field
                        }
                    }
                } else if (field === 'length') {
                    const numValue = parseInt(value, 10);
                    updatedField.length = isNaN(numValue) || numValue <= 0 ? undefined : numValue;
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
    const defaultLength = (dataType === 'Alfanumérico' || dataType === 'Texto') ? correspondingMapping?.length : 10; // Use mapping length for text, else 10

    const newOutputField: OutputFieldConfig = {
        id: `mapped-${newFieldId}-${Date.now()}`, // More unique ID
        isStatic: false,
        mappedField: newFieldId,
        order: maxOrder + 1,
        length: outputConfig.format === 'txt' ? (defaultLength ?? 10) : undefined,
        paddingChar: outputConfig.format === 'txt' ? getDefaultPaddingChar({isStatic: false, mappedField: newFieldId, id: '', order: 0 }, columnMappings) : undefined,
        paddingDirection: outputConfig.format === 'txt' ? getDefaultPaddingDirection({isStatic: false, mappedField: newFieldId, id: '', order: 0 }, columnMappings) : undefined,
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
             length: outputConfig.format === 'txt' ? len : undefined,
             paddingChar: outputConfig.format === 'txt' ? paddingChar : undefined,
             paddingDirection: outputConfig.format === 'txt' ? paddingDirection : undefined,
              // Cannot have dateFormat for static fields
         };


        setOutputConfig(prev => {
            let newFields;
            if (isEditing) {
                // Find existing field and update, keep original order for now
                 const existingFieldIndex = prev.fields.findIndex(f => f.id === fieldId);
                 if (existingFieldIndex === -1) return prev; // Should not happen
                 newFields = [...prev.fields];
                 newFields[existingFieldIndex] = { ...staticField, order: prev.fields[existingFieldIndex].order }; // Preserve order

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


  // Effect to initialize/update output fields based on mapped fields
   useEffect(() => {
       const mappedFieldsWithOptions = columnMappings
           .filter(m => m.mappedField !== null)
           .map((m, index) => {
                const dataType = m.dataType ?? null;
                const baseField: Omit<OutputFieldConfig, 'id' | 'order'> & { mappedField: string } = {
                    isStatic: false,
                    mappedField: m.mappedField!,
                    length: (dataType === 'Alfanumérico' || dataType === 'Texto') ? (m.length ?? 10) : undefined,
                    paddingChar: undefined, // Will be set based on format
                    paddingDirection: undefined, // Will be set based on format
                    dateFormat: dataType === 'Data' ? 'YYYYMMDD' : undefined, // Add default date format
                };
                // Add format-specific defaults
                if (outputConfig.format === 'txt') {
                    baseField.length = baseField.length ?? 10; // Ensure length for TXT
                    baseField.paddingChar = getDefaultPaddingChar(baseField, columnMappings);
                    baseField.paddingDirection = getDefaultPaddingDirection(baseField, columnMappings);
                }
                return { ...baseField, id: `mapped-${m.mappedField!}-${index}`, order: index }; // Add ID and initial order
           });

       // Filter out duplicate mapped fields, keeping the first occurrence's order
       const uniqueMappedFields = mappedFieldsWithOptions.reduce((acc, current) => {
           if (!acc.some(item => !item.isStatic && item.mappedField === current.mappedField)) {
               acc.push(current);
           }
           return acc;
       }, [] as OutputFieldConfig[]);

       setOutputConfig(prev => {
            const existingFieldsMap = new Map(prev.fields.map(f => [f.id, f])); // Use ID as key

             // Combine existing static fields with new/updated mapped fields
            const allPotentialFields = [
                ...prev.fields.filter(f => f.isStatic), // Keep existing static fields
                ...uniqueMappedFields // Add unique mapped fields
            ];


            const newFields = allPotentialFields.map((potentialField, index) => {
                const existingField = existingFieldsMap.get(potentialField.id);
                let correspondingMapping: ColumnMapping | undefined;
                if(!potentialField.isStatic) {
                    correspondingMapping = columnMappings.find(cm => cm.mappedField === potentialField.mappedField);
                }
                const dataType = correspondingMapping?.dataType ?? null;


                if (existingField) {
                    // If field exists (by ID), update its properties based on format/mapping changes
                     const updatedExistingField = { ...existingField };

                    if (outputConfig.format === 'txt') {
                        updatedExistingField.length = updatedExistingField.length ?? (potentialField.length ?? 10); // Ensure length
                        updatedExistingField.paddingChar = updatedExistingField.paddingChar ?? (potentialField.paddingChar ?? getDefaultPaddingChar(updatedExistingField, columnMappings));
                        updatedExistingField.paddingDirection = updatedExistingField.paddingDirection ?? (potentialField.paddingDirection ?? getDefaultPaddingDirection(updatedExistingField, columnMappings));
                    } else {
                        // Remove TXT-specific props if format is not TXT
                        delete updatedExistingField.length;
                        delete updatedExistingField.paddingChar;
                        delete updatedExistingField.paddingDirection;
                    }
                     // Update or add dateFormat if it's a date field
                     if (!updatedExistingField.isStatic && dataType === 'Data') {
                        updatedExistingField.dateFormat = updatedExistingField.dateFormat ?? potentialField.dateFormat ?? 'YYYYMMDD';
                    } else if (!updatedExistingField.isStatic) {
                        delete updatedExistingField.dateFormat; // Remove if not date
                    }

                     // Preserve original order from existing field
                    updatedExistingField.order = existingField.order;
                    return updatedExistingField;
                } else {
                    // If it's a new field (should only be newly mapped fields here)
                    const newField = { ...potentialField };
                     newField.order = prev.fields.length + index; // Append to end order initially
                      // Ensure format-specific props are correct
                     if (outputConfig.format === 'txt') {
                        newField.length = newField.length ?? 10;
                        newField.paddingChar = newField.paddingChar ?? getDefaultPaddingChar(newField, columnMappings);
                        newField.paddingDirection = newField.paddingDirection ?? getDefaultPaddingDirection(newField, columnMappings);
                    } else {
                        delete newField.length;
                        delete newField.paddingChar;
                        delete newField.paddingDirection;
                    }
                     // Ensure dateFormat is set correctly for new date fields
                     if (!newField.isStatic && dataType === 'Data') {
                        newField.dateFormat = newField.dateFormat ?? 'YYYYMMDD';
                    } else if (!newField.isStatic) {
                        delete newField.dateFormat;
                    }

                    return newField;
                }
            });

           // Remove fields from outputConfig that are no longer mapped (and are not static)
           const finalFields = newFields.filter(nf =>
                nf.isStatic || uniqueMappedFields.some(uf => !uf.isStatic && uf.mappedField === (!nf.isStatic ? nf.mappedField : ''))
            );

           // Sort and re-order
           finalFields.sort((a, b) => a.order - b.order);
           const reorderedFinalFields = finalFields.map((f, idx) => ({ ...f, order: idx }));

           return {
               ...prev,
               fields: reorderedFinalFields
           };
       });

   }, [columnMappings, outputConfig.format]); // Rerun when mappings or format change


  // --- Conversion ---
  const convertFile = () => {
    setIsProcessing(true);
    setConvertedData(''); // Clear previous results

    if (!fileData || fileData.length === 0 || outputConfig.fields.length === 0) {
        toast({ title: "Erro", description: "Dados de entrada ou configuração de saída incompletos.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    // Validate mappings and output config
    const mappedOutputFields = outputConfig.fields.filter(f => !f.isStatic);
    const requiredMappings = columnMappings.filter(m => mappedOutputFields.some(f => !f.isStatic && f.mappedField === m.mappedField)); // Filter non-static

    if (requiredMappings.some(m => m.mappedField && !m.dataType)) {
        toast({ title: "Erro", description: "Defina o 'Tipo' para todos os campos mapeados usados na saída.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
     if (outputConfig.format === 'txt' && outputConfig.fields.some(f => !f.length || f.length <= 0)) {
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

      fileData.forEach(row => {
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
             dataType = /^-?\d+([.,]\d+)?$/.test(value) ? 'Numérico' : 'Texto';
          } else {
             mapping = columnMappings.find(m => m.mappedField === outputField.mappedField);
             if (!mapping || !mapping.originalHeader) {
                 console.warn(`Mapeamento não encontrado para o campo de saída: ${outputField.mappedField}`);
                 value = ''; // Default to empty string if mapping missing
             } else {
                 originalValue = row[mapping.originalHeader] ?? ''; // Get original value
                 value = String(originalValue).trim(); // Work with the string representation, trim
                 dataType = mapping.dataType; // Get data type from mapping

                 // Apply mask removal if configured
                  if (mapping.removeMask && dataType) {
                      value = removeMask(value, dataType);
                  }


                 // Apply formatting/validation based on dataType (AFTER mask removal)
                 switch (dataType) {
                      case 'CPF':
                      case 'CNPJ':
                      case 'Inteiro':
                           value = value.replace(/\D/g, ''); // Ensure only digits remain
                           break;
                      case 'Numérico':
                           // Handle different numeric inputs (0, 130, 179.1, -350) -> format to "0.00", "130.00", "179.10", "-350.00"
                           // Allow negative sign and decimal separator (dot or comma)
                            value = value.replace(/,/g, '.'); // Standardize decimal separator to dot
                            const numMatch = value.match(/^(-?\d+\.?\d*)|(^-?\d*)/); // Match number, allow leading/trailing dot, handle negative
                            if (numMatch && numMatch[0]) {
                                let numVal = parseFloat(numMatch[0]);
                                if (isNaN(numVal)) {
                                    value = '0.00'; // Default to 0.00 if parsing fails
                                } else {
                                    value = numVal.toFixed(2); // Format to 2 decimal places
                                }
                            } else {
                                value = '0.00'; // Default if no valid number found
                            }
                          break;
                      case 'Contábil':
                           // Similar to numeric but might need specific accounting format (e.g., no decimal for cents)
                            value = value.replace(/,/g, '.'); // Standardize decimal separator
                            const accMatch = value.match(/^(-?\d+\.?\d*)|(^-?\d*)/);
                            if (accMatch && accMatch[0]) {
                                let accVal = parseFloat(accMatch[0]);
                                if (isNaN(accVal)) {
                                    value = '000'; // Or appropriate default for accounting integer format
                                } else {
                                    // Format as cents integer (e.g., 1234.56 -> 123456, -350.00 -> -35000)
                                     value = Math.round(accVal * 100).toString();
                                }
                            } else {
                                value = '000'; // Default
                            }
                          break;
                      case 'Data':
                          try {
                              let parsedDate: Date | null = null;
                              // Attempt parsing common formats (DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY etc.)
                              // This needs a more robust date parsing library for real-world scenarios
                              const cleanedDate = value.replace(/\D/g, ''); // Remove separators first if mask removed
                              let year = '', month = '', day = '';

                              if (cleanedDate.length === 8) { // Assume YYYYMMDD or DDMMYYYY or MMDDYYYY
                                 if (mapping?.removeMask || /^\d{8}$/.test(value)) {
                                      // Try YYYYMMDD first
                                      year = cleanedDate.substring(0, 4);
                                      month = cleanedDate.substring(4, 6);
                                      day = cleanedDate.substring(6, 8);
                                      parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                      if (isNaN(parsedDate.getTime())) { // If YYYYMMDD failed, try DDMMYYYY
                                          year = cleanedDate.substring(4, 8);
                                          month = cleanedDate.substring(2, 4);
                                          day = cleanedDate.substring(0, 2);
                                          parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                      }
                                      if (isNaN(parsedDate.getTime())) { // If DDMMYYYY failed, try MMDDYYYY
                                          year = cleanedDate.substring(4, 8);
                                          month = cleanedDate.substring(0, 2);
                                          day = cleanedDate.substring(2, 4);
                                          parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                      }

                                 }
                              }

                              // Fallback to Date constructor if specific parsing failed or mask wasn't removed/didn't match
                              if (!parsedDate || isNaN(parsedDate.getTime())) {
                                  parsedDate = new Date(value); // Less reliable, depends on browser locale
                              }


                              if (parsedDate && !isNaN(parsedDate.getTime())) {
                                  const y = parsedDate.getFullYear();
                                  const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
                                  const d = String(parsedDate.getDate()).padStart(2, '0');
                                  const dateFormat = outputField.dateFormat || 'YYYYMMDD'; // Use configured format
                                  value = dateFormat === 'YYYYMMDD' ? `${y}${m}${d}` : `${d}${m}${y}`;
                              } else {
                                  console.warn(`Could not parse date: ${originalValue}`);
                                  value = ''; // Set to empty if parsing fails
                              }
                          } catch (e) {
                                console.error(`Error parsing date: ${originalValue}`, e);
                                value = '';
                          }
                          break;
                      case 'Alfanumérico':
                      case 'Texto':
                      default:
                          // Value is already trimmed string, potentially with mask removed
                          break;
                 }
             }
          }


          // --- Apply Output Formatting (TXT Padding or CSV Delimiting) ---
          if (outputConfig.format === 'txt') {
             const len = outputField.length || 0;
             const padChar = outputField.paddingChar || ' ';
             const padDir = outputField.paddingDirection || 'right';
             let processedValue = value; // Value already holds the formatted/cleaned data

              // Special handling for negative numeric/contabil values in TXT
             if ((dataType === 'Numérico' || dataType === 'Contábil') && processedValue.startsWith('-')) {
                 const absValue = processedValue.substring(1); // Get absolute value part
                 const negativeSign = '-';
                 if (len > 0) {
                     if (absValue.length >= len) {
                         // If absolute value alone fills/exceeds length, truncate (might lose sign) - suboptimal
                         processedValue = absValue.substring(absValue.length - len);
                     } else {
                          const padLen = len - absValue.length - negativeSign.length; // Account for sign length
                          if (padLen >= 0) {
                              if (padDir === 'left') { // Pad left, sign usually comes first
                                  processedValue = negativeSign + padChar.repeat(padLen) + absValue;
                              } else { // Pad right (less common for numbers, but possible)
                                   // Sign position needs clarification - assuming sign stays with number
                                   processedValue = negativeSign + absValue + padChar.repeat(padLen);
                                   // Ensure total length constraint, might truncate number if padChar added
                                   if(processedValue.length > len) processedValue = processedValue.substring(0, len);

                              }
                          } else {
                              // Not enough space for sign and value, truncate value
                               processedValue = (negativeSign + absValue).substring(0, len);
                          }
                     }
                 }
             }
             // Standard padding/truncating for non-negative or non-numeric
             else {
                  if (processedValue.length > len) {
                     processedValue = processedValue.substring(0, len); // Truncate
                  } else if (processedValue.length < len) {
                     const padLen = len - processedValue.length;
                     if (padDir === 'left') {
                         processedValue = padChar.repeat(padLen) + processedValue;
                     } else { // right
                         processedValue = processedValue + padChar.repeat(padLen);
                     }
                 }
             }

             line += processedValue;

          } else if (outputConfig.format === 'csv') {
            if (fieldIndex > 0) {
              line += outputConfig.delimiter;
            }
             // Basic CSV escaping - use original unformatted value if needed? Check requirements.
             // Using the processed 'value' for now.
             let csvValue = value;
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
    }
  };

   const downloadConvertedFile = () => {
        if (!convertedData) return;

        const mimeType = outputConfig.format === 'txt'
            ? `text/plain;charset=${outputEncoding.toLowerCase()}`
            : `text/csv;charset=${outputEncoding.toLowerCase()}`;

         // Create Blob from Buffer or string
         const blob = convertedData instanceof Buffer
             ? new Blob([convertedData], { type: mimeType })
             : new Blob([convertedData], { type: mimeType }); // Fallback if it's somehow a string

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const outputFileName = `${fileName.split('.').slice(0, -1).join('.')}_convertido.${outputConfig.format}`;
        link.download = outputFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: "Download Iniciado", description: `Arquivo ${outputFileName} sendo baixado.`});
    };

  const resetState = () => {
    setFile(null);
    setFileName('');
    setHeaders([]);
    setFileData([]);
    setColumnMappings([]);
    setOutputConfig({ format: 'txt', fields: [] });
    setPredefinedFields(PREDEFINED_FIELDS);
    setNewFieldName('');
    setConvertedData('');
    setOutputEncoding('UTF-8'); // Reset encoding
    setIsProcessing(false);
    setActiveTab("upload");
    setShowPreview(false);
     setStaticFieldDialogState({ isOpen: false, isEditing: false, fieldName: '', staticValue: '', length: '', paddingChar: ' ', paddingDirection: 'right' });
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const getSampleData = () => {
    return fileData.slice(0, 5); // Show first 5 rows as sample
  };

 // Render helper for Output Field selection for MAPPED fields
 const renderMappedOutputFieldSelect = (currentField: OutputFieldConfig) => {
     if (currentField.isStatic) return null; // Only for mapped fields

     const currentFieldMappedId = currentField.mappedField;
     const availableOptions = predefinedFields
         .filter(pf =>
             pf.id === currentFieldMappedId || !outputConfig.fields.some(of => !of.isStatic && of.mappedField === pf.id)
         )
         .filter(pf => columnMappings.some(cm => cm.mappedField === pf.id));

     return (
         <Select
             value={currentFieldMappedId || NONE_VALUE_PLACEHOLDER}
             onValueChange={(value) => handleOutputFieldChange(currentField.id, 'mappedField', value)}
             disabled={isProcessing}
         >
             <SelectTrigger className="w-full">
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
            <Columns className="inline-block mr-2 text-accent" /> DataForge
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Converta seus arquivos Excel ou PDF para layouts TXT ou CSV personalizados.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="upload" disabled={isProcessing}>1. Upload</TabsTrigger>
              <TabsTrigger value="mapping" disabled={isProcessing || !file}>2. Mapeamento</TabsTrigger>
              <TabsTrigger value="config" disabled={isProcessing || !file || headers.length === 0}>3. Configurar Saída</TabsTrigger>
              <TabsTrigger value="result" disabled={isProcessing || !convertedData}>4. Resultado</TabsTrigger>
            </TabsList>

            {/* 1. Upload Tab */}
            <TabsContent value="upload">
              <div className="flex flex-col items-center space-y-6 p-6 border rounded-lg bg-card">
                <Label htmlFor="file-upload" className="text-lg font-semibold text-foreground flex items-center cursor-pointer hover:text-accent transition-colors">
                  <Upload className="mr-2 h-6 w-6" />
                  Selecione o Arquivo para Conversão
                </Label>
                <p className="text-sm text-muted-foreground">Formatos suportados: XLS, XLSX, ODS, PDF (experimental)</p>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".xls,.xlsx,.ods,.pdf"
                  onChange={handleFileChange}
                  className="block w-full max-w-md text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                  disabled={isProcessing}
                />
                {fileName && (
                  <div className="mt-4 text-center text-sm text-muted-foreground">
                    Arquivo selecionado: <span className="font-medium text-foreground">{fileName}</span>
                  </div>
                )}
                 {isProcessing && activeTab === "upload" && <p className="text-accent animate-pulse">Processando arquivo...</p>}
              </div>
            </TabsContent>

            {/* 2. Mapping Tab */}
            <TabsContent value="mapping">
              {isProcessing && <p className="text-accent text-center animate-pulse">Lendo arquivo...</p>}
              {!isProcessing && headers.length > 0 && (
                <div className="space-y-6">
                  <Card>
                     <CardHeader>
                         <CardTitle className="text-xl">Mapeamento de Colunas de Entrada</CardTitle>
                         <CardDescription>Associe as colunas do seu arquivo, configure tipos, tamanhos e remoção de máscaras.</CardDescription>
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
                                                <HelpCircle className="inline-block ml-1 h-4 w-4 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Opcional. Define o tamanho máx.</p>
                                                <p>Relevante para Alfanumérico/Texto (TXT).</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                 </TableHead>
                                 <TableHead className="w-[20%] text-center"> {/* Remove Mask */}
                                     Remover Máscara
                                      <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <HelpCircle className="inline-block ml-1 h-4 w-4 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Remove caracteres não numéricos/separadores.</p>
                                                <p>Útil para CPF, CNPJ, RG, Data, Numérico, etc.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                  </TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                               {columnMappings.map((mapping, index) => (
                                 <TableRow key={index}>
                                   <TableCell className="font-medium text-xs">{mapping.originalHeader}</TableCell>
                                   <TableCell>
                                     <Select
                                       value={mapping.mappedField || NONE_VALUE_PLACEHOLDER}
                                       onValueChange={(value) => handleMappingChange(index, 'mappedField', value)}
                                        disabled={isProcessing}
                                     >
                                       <SelectTrigger className="text-xs h-8">
                                         <SelectValue placeholder="Selecione ou deixe em branco" />
                                       </SelectTrigger>
                                       <SelectContent>
                                         <SelectItem value={NONE_VALUE_PLACEHOLDER}>-- Não Mapear --</SelectItem>
                                         {predefinedFields.map(field => (
                                           <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>
                                         ))}
                                       </SelectContent>
                                     </Select>
                                   </TableCell>
                                   <TableCell>
                                     <Select
                                       value={mapping.dataType || NONE_VALUE_PLACEHOLDER}
                                       onValueChange={(value) => handleMappingChange(index, 'dataType', value)}
                                       disabled={isProcessing || !mapping.mappedField}
                                     >
                                       <SelectTrigger className="text-xs h-8">
                                         <SelectValue placeholder="Tipo" />
                                       </SelectTrigger>
                                       <SelectContent>
                                         <SelectItem value={NONE_VALUE_PLACEHOLDER}>-- Selecione --</SelectItem>
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
                                       placeholder="Tam." // Shorter placeholder
                                       className="w-full text-xs h-8"
                                       disabled={isProcessing || !mapping.dataType || !['Alfanumérico', 'Texto'].includes(mapping.dataType)}
                                     />
                                   </TableCell>
                                    <TableCell className="text-center"> {/* Center align Switch */}
                                      <Switch
                                          checked={mapping.removeMask}
                                          onCheckedChange={(checked) => handleMappingChange(index, 'removeMask', checked)}
                                          // Enable for relevant types where mask removal makes sense
                                          disabled={isProcessing || !mapping.mappedField || !['CPF', 'RG', 'CNPJ', 'Numérico', 'Inteiro', 'Contábil', 'Data'].includes(mapping.dataType ?? '')}
                                          aria-label={`Remover máscara para ${mapping.originalHeader}`}
                                          className="scale-75" // Slightly smaller switch
                                      />
                                   </TableCell>
                                 </TableRow>
                               ))}
                             </TableBody>
                           </Table>
                         </div>
                     </CardContent>
                  </Card>

                  <Card>
                     <CardHeader>
                         <CardTitle className="text-xl">Gerenciar Campos Pré-definidos</CardTitle>
                         <CardDescription>Adicione ou remova campos personalizados para o mapeamento. O ID será gerado automaticamente.</CardDescription>
                     </CardHeader>
                     <CardContent>
                        <div className="flex gap-2 mb-4">
                            <Input
                                type="text"
                                placeholder="Nome do Novo Campo"
                                value={newFieldName}
                                onChange={(e) => setNewFieldName(e.target.value)}
                                className="flex-grow"
                                disabled={isProcessing}
                            />
                            <Button onClick={addPredefinedField} disabled={isProcessing || !newFieldName.trim()} variant="outline">
                                <Plus className="mr-2 h-4 w-4" /> Adicionar
                            </Button>
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2 bg-secondary/30">
                            {predefinedFields.map(field => (
                                <div key={field.id} className="flex items-center justify-between p-2 border-b last:border-b-0">
                                    <span className="text-sm font-medium">{field.name} <span className="text-xs text-muted-foreground">({field.id})</span></span>
                                     <TooltipProvider>
                                        <Tooltip>
                                             <TooltipTrigger asChild>
                                                  <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      onClick={() => removePredefinedField(field.id)}
                                                      disabled={isProcessing || ['matricula', 'cpf', 'rg', 'nome', 'email', 'cnpj'].includes(field.id)}
                                                      className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:text-muted-foreground/50"
                                                      aria-label={`Remover campo ${field.name}`}
                                                  >
                                                      <Trash2 className="h-4 w-4" />
                                                  </Button>
                                             </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Remover campo "{field.name}"</p>
                                                 {['matricula', 'cpf', 'rg', 'nome', 'email', 'cnpj'].includes(field.id) && <p>(Este campo pré-definido não pode ser removido)</p>}
                                            </TooltipContent>
                                        </Tooltip>
                                     </TooltipProvider>
                                </div>
                            ))}
                            {predefinedFields.length === 0 && <p className="text-sm text-muted-foreground text-center p-2">Nenhum campo definido.</p>}
                        </div>
                     </CardContent>
                      <CardFooter className="flex justify-end">
                         <Button onClick={() => setActiveTab("config")} disabled={isProcessing || headers.length === 0} variant="default">
                             Próximo: Configurar Saída <ArrowRight className="ml-2 h-4 w-4" />
                         </Button>
                      </CardFooter>
                  </Card>
                </div>
              )}
               {!isProcessing && headers.length === 0 && file && (
                 <p className="text-center text-muted-foreground p-4">Nenhum cabeçalho encontrado ou arquivo ainda não processado.</p>
               )}
               {!isProcessing && !file && (
                   <p className="text-center text-muted-foreground p-4">Faça o upload de um arquivo na aba "Upload" para começar.</p>
               )}
            </TabsContent>

            {/* 3. Configuration Tab */}
            <TabsContent value="config">
              {isProcessing && <p className="text-accent text-center animate-pulse">Carregando...</p>}
               {!isProcessing && file && headers.length > 0 && (
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
                                                  <TableHead className="w-2/12">Campo</TableHead>
                                                   <TableHead className="w-2/12">Formato Data</TableHead> {/* Date Format */}
                                                  {outputConfig.format === 'txt' && (
                                                      <>
                                                          <TableHead className="w-1/12"> {/* Size */}
                                                              Tam.
                                                              <TooltipProvider>
                                                                  <Tooltip>
                                                                      <TooltipTrigger asChild><HelpCircle className="inline-block ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger>
                                                                      <TooltipContent><p>Tamanho fixo.</p></TooltipContent>
                                                                  </Tooltip>
                                                              </TooltipProvider>
                                                          </TableHead>
                                                           <TableHead className="w-1/12"> {/* Padding Char */}
                                                              Preench.
                                                               <TooltipProvider>
                                                                  <Tooltip>
                                                                      <TooltipTrigger asChild><HelpCircle className="inline-block ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger>
                                                                      <TooltipContent><p>Caractere (1).</p></TooltipContent>
                                                                  </Tooltip>
                                                              </TooltipProvider>
                                                           </TableHead>
                                                           <TableHead className="w-2/12"> {/* Padding Direction */}
                                                              Direção Preench.
                                                               <TooltipProvider>
                                                                  <Tooltip>
                                                                      <TooltipTrigger asChild><HelpCircle className="inline-block ml-1 h-4 w-4 text-muted-foreground cursor-help" /></TooltipTrigger>
                                                                      <TooltipContent>
                                                                            <p>Esquerda (001) ou Direita (ABC ).</p>
                                                                       </TooltipContent>
                                                                  </Tooltip>
                                                              </TooltipProvider>
                                                           </TableHead>
                                                      </>
                                                  )}
                                                  <TableHead className="w-[80px] text-right">Ações</TableHead>
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
                                                                placeholder={field.isStatic ? ( /^-?\d+$/.test(field.staticValue) ? '0' : ' ' ) : (isNumericType(dataType) ? '0' : ' ')} // Dynamic placeholder
                                                                className="w-10 text-center h-8 text-xs"
                                                                disabled={isProcessing}
                                                                aria-label={`Caractere de preenchimento do campo ${field.isStatic ? field.fieldName : (predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? field.mappedField)}`}
                                                             />
                                                         </TableCell>
                                                         <TableCell>
                                                              <Select
                                                                 value={field.paddingDirection ?? 'right'}
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
                                                     <TableCell className="text-right">
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
                                          <Plus className="mr-2 h-4 w-4" /> Adicionar Mapeado
                                      </Button>
                                      <Button onClick={openAddStaticFieldDialog} variant="outline" size="sm" disabled={isProcessing}>
                                          <Plus className="mr-2 h-4 w-4" /> Adicionar Estático
                                      </Button>
                                   </div>
                             </div>
                         </CardContent>
                         <CardFooter className="flex justify-between">
                             <Button variant="outline" onClick={() => setActiveTab("mapping")} disabled={isProcessing}>Voltar</Button>
                             <Button onClick={convertFile} disabled={isProcessing || outputConfig.fields.length === 0} variant="default">
                                 {isProcessing ? 'Convertendo...' : 'Iniciar Conversão'}
                                 {!isProcessing && <ArrowRight className="ml-2 h-4 w-4" />}
                             </Button>
                         </CardFooter>
                    </Card>
                 </div>
                )}
                 {!isProcessing && (!file || headers.length === 0) && (
                    <p className="text-center text-muted-foreground p-4">Complete as etapas de Upload e Mapeamento primeiro.</p>
                )}
            </TabsContent>

             {/* 4. Result Tab */}
            <TabsContent value="result">
               {isProcessing && <p className="text-accent text-center animate-pulse">Gerando resultado...</p>}
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
                                          : convertedData}
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
                                 <Button onClick={downloadConvertedFile} disabled={isProcessing || !convertedData} variant="default">
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

        <CardFooter className="text-center text-xs text-muted-foreground pt-4 border-t flex justify-between items-center">
           <span>© {new Date().getFullYear()} DataForge. Ferramenta de conversão de dados.</span>
           <span className="font-mono text-accent">v{appVersion}</span> {/* Display Version */}
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
                             placeholder="Ex: 001001"
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
                                    placeholder="Ex: 0 ou espaço"
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

    </div>
  );
}

// Placeholder for PDF extraction - Keep this minimal or implement properly server-side
async function extractTextFromPdf(data: ArrayBuffer): Promise<string> {
  console.warn("extractTextFromPdf is a placeholder and needs proper implementation.");
  return Promise.resolve("Texto extraído do PDF (placeholder)\nLinha 2 do PDF (placeholder)");
}
