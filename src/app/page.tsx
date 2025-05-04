
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
// pdf-parse needs specific handling for Node vs Browser, might need server-side processing
// import pdf from 'pdf-parse/lib/pdf-parse'; // Example, requires adjustments

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, FileText, FileSpreadsheet, Settings, ArrowRight, Trash2, Plus, HelpCircle, Columns } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Textarea } from '@/components/ui/textarea'; // Import Textarea
import { Switch } from "@/components/ui/switch"; // Import Switch

// Define types
type DataType = 'Inteiro' | 'Alfanumérico' | 'Numérico' | 'Contábil' | 'Data' | 'Texto' | 'CPF'; // Added CPF
type PredefinedField = { id: string; name: string };
type ColumnMapping = {
  originalHeader: string;
  mappedField: string | null; // ID of predefined field or null
  dataType: DataType | null;
  length?: number | null;
};
type OutputFormat = 'txt' | 'csv';
type OutputConfig = {
  format: OutputFormat;
  delimiter?: string; // For CSV
  fields: {
    mappedField: string; // ID of predefined field
    order: number;
    length?: number; // For TXT
  }[];
};

const PREDEFINED_FIELDS: PredefinedField[] = [
  { id: 'matricula', name: 'Matrícula' },
  { id: 'cpf', name: 'CPF' },
  { id: 'rg', name: 'RG' },
  { id: 'nome', name: 'Nome' },
  { id: 'email', name: 'E-mail' },
];

const DATA_TYPES: DataType[] = ['Inteiro', 'Alfanumérico', 'Numérico', 'Contábil', 'Data', 'Texto', 'CPF']; // Added CPF
const NONE_VALUE_PLACEHOLDER = "__NONE__"; // Placeholder for empty select values

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
  const [convertedData, setConvertedData] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [showPreview, setShowPreview] = useState<boolean>(false);


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
          extractedData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // header: 1 gets array of arrays

          if (extractedData.length > 0) {
            extractedHeaders = extractedData[0].map(String); // First row as headers
            extractedData = extractedData.slice(1).map(row => { // Remaining rows as data
              const rowData: { [key: string]: any } = {};
              extractedHeaders.forEach((header, index) => {
                rowData[header] = row[index];
              });
              return rowData;
            });
          }
        } else if (fileToProcess.type === 'application/pdf') {
          // PDF parsing is complex and might require server-side processing or a more robust library
          // This is a placeholder and likely won't work reliably for complex PDFs
          toast({
            title: "Aviso",
            description: "A extração de PDF é experimental e pode não funcionar corretamente para todos os arquivos.",
            variant: "default",
          });
          // Example using a hypothetical simple extraction - NEEDS REPLACEMENT
          // const text = await extractTextFromPdf(data as ArrayBuffer); // You'd need this function
          // const lines = text.split('\n');
          // if (lines.length > 0) {
          //   extractedHeaders = lines[0].split(/\s+/); // Simple split, likely inaccurate
          //   extractedData = lines.slice(1).map(line => {
          //     const values = line.split(/\s+/);
          //     const rowData: { [key: string]: any } = {};
          //     extractedHeaders.forEach((header, index) => {
          //       rowData[header] = values[index];
          //     });
          //     return rowData;
          //   });
          // }
          extractedHeaders = ['Coluna PDF 1', 'Coluna PDF 2']; // Placeholder
          extractedData = [{ 'Coluna PDF 1': 'Dado 1', 'Coluna PDF 2': 'Dado A' }, { 'Coluna PDF 1': 'Dado 2', 'Coluna PDF 2': 'Dado B' }]; // Placeholder
        }

        if (extractedHeaders.length === 0) {
          throw new Error("Não foi possível extrair cabeçalhos do arquivo.");
        }

        setHeaders(extractedHeaders);
        setFileData(extractedData);
        setColumnMappings(extractedHeaders.map(header => ({
          originalHeader: header,
          mappedField: guessPredefinedField(header), // Attempt to guess
          dataType: guessDataType(header), // Attempt to guess data type
          length: null,
        })));
      };
      reader.onerror = () => {
        throw new Error("Falha ao ler o arquivo.");
      };

      if (fileToProcess.type === 'application/pdf') {
        reader.readAsArrayBuffer(fileToProcess); // Read as ArrayBuffer for potential PDF libraries
      } else {
        reader.readAsArrayBuffer(fileToProcess); // Use ArrayBuffer for XLSX
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

      // Special handling for length based on dataType
      if (field === 'dataType') {
         (currentMapping[field] as any) = actualValue;
         // Reset length if dataType changes and is not Alphanumeric or Texto
         if (actualValue !== 'Alfanumérico' && actualValue !== 'Texto') {
           currentMapping.length = null;
         }
       } else if (field === 'length') {
            // Ensure length is stored as a number or null
           const numValue = parseInt(value, 10);
           currentMapping.length = isNaN(numValue) || numValue <= 0 ? null : numValue;
       } else {
         // Handle mappedField and other fields
          (currentMapping[field] as any) = actualValue;
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
      if (lowerHeader.includes('cpf')) return 'CPF';
      if (lowerHeader.includes('data') || lowerHeader.includes('date')) return 'Data';
      if (lowerHeader.includes('valor') || lowerHeader.includes('salário') || lowerHeader.includes('contábil')) return 'Contábil';
      if (lowerHeader.includes('num') || lowerHeader.includes('idade') || lowerHeader.includes('quant')) return 'Numérico';
      if (lowerHeader.includes('matrícula') || lowerHeader.includes('código') || lowerHeader.includes('id')) return 'Inteiro';
      if (lowerHeader.includes('nome') || lowerHeader.includes('descrição') || lowerHeader.includes('texto')) return 'Texto';
      // Default guess if contains letters
      if (/[a-zA-Z]/.test(lowerHeader)) return 'Alfanumérico';
      // Default guess if only numbers (less likely for headers)
      if (/^\d+$/.test(lowerHeader)) return 'Inteiro';

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
    // Prevent removing core fields if needed, or add confirmation
    const fieldToRemove = predefinedFields.find(f => f.id === idToRemove);
    if (fieldToRemove && ['matricula', 'cpf', 'rg', 'nome', 'email'].includes(idToRemove)) {
         toast({ title: "Aviso", description: `Não é possível remover o campo pré-definido "${fieldToRemove.name}".`, variant: "default" });
         return;
     }
     if (!fieldToRemove) return; // Should not happen

    setPredefinedFields(predefinedFields.filter(f => f.id !== idToRemove));
    // Also update mappings that used this field
    setColumnMappings(prev => prev.map(m => m.mappedField === idToRemove ? { ...m, mappedField: null } : m));
    // Also update output config
    setOutputConfig(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.mappedField !== idToRemove),
    }));
    toast({ title: "Sucesso", description: `Campo "${fieldToRemove?.name}" removido.` });
  };

  // --- Output Configuration ---
   const handleOutputFormatChange = (value: OutputFormat) => {
    setOutputConfig(prev => ({
      ...prev,
      format: value,
      delimiter: value === 'csv' ? (prev.delimiter || '|') : undefined, // Default delimiter for CSV
      // Reset field lengths if switching from TXT to CSV
      fields: prev.fields.map(f => ({ ...f, length: value === 'txt' ? (f.length ?? 10) : undefined })), // Preserve or set default length for TXT
    }));
  };

  const handleDelimiterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setOutputConfig(prev => ({ ...prev, delimiter: event.target.value }));
  };

  const handleOutputFieldChange = (index: number, field: keyof OutputConfig['fields'][0], value: any) => {
      setOutputConfig(prev => {
          const newFields = [...prev.fields];
          if (index < 0 || index >= newFields.length) return prev; // Index out of bounds check

          const currentField = { ...newFields[index] };
          let actualValue = value === NONE_VALUE_PLACEHOLDER ? null : value;

           if (field === 'mappedField') {
                (currentField[field] as any) = actualValue;
                // Update length based on the new mapped field's mapping if available and format is TXT
                if(prev.format === 'txt') {
                    const correspondingMapping = columnMappings.find(cm => cm.mappedField === actualValue);
                    if (correspondingMapping && (correspondingMapping.dataType === 'Alfanumérico' || correspondingMapping.dataType === 'Texto')) {
                         currentField.length = correspondingMapping.length ?? 10; // Use mapping length or default
                     } else if (correspondingMapping) {
                        // For non-text types in TXT, maybe default length or get from mapping if set?
                        // Let's assume a default for now, user can override.
                         currentField.length = 10;
                     } else {
                         currentField.length = 10; // Default if no mapping found yet
                     }
                }

           } else if (field === 'length') {
              const numValue = parseInt(value, 10);
              currentField.length = isNaN(numValue) || numValue <= 0 ? undefined : numValue;
            } else if (field === 'order') {
              const numValue = parseInt(value, 10);
              currentField.order = isNaN(numValue) ? (newFields.length > 0 ? Math.max(...newFields.map(f => f.order)) + 1 : 0) : numValue; // Default to next order if invalid
            } else {
              (currentField[field] as any) = actualValue;
            }


          newFields[index] = currentField;

           // Re-sort fields by order after modification
           newFields.sort((a, b) => a.order - b.order);

           // Re-assign order based on sorted position to ensure sequence
           const reorderedFields = newFields.map((f, idx) => ({ ...f, order: idx }));


          return { ...prev, fields: reorderedFields };
      });
  };

  const addOutputField = () => {
    const availableMappedFields = columnMappings
        .filter(m => m.mappedField !== null && !outputConfig.fields.some(of => of.mappedField === m.mappedField))
        .map(m => m.mappedField);

    if (availableMappedFields.length === 0) {
        toast({ title: "Aviso", description: "Não há mais campos mapeados disponíveis para adicionar.", variant: "default"});
        return;
    }

    // Find the highest current order to add the new field at the end
    const maxOrder = outputConfig.fields.length > 0 ? Math.max(...outputConfig.fields.map(f => f.order)) : -1;
    const newFieldId = availableMappedFields[0]!;
    const correspondingMapping = columnMappings.find(cm => cm.mappedField === newFieldId);
    const defaultLength = (correspondingMapping && (correspondingMapping.dataType === 'Alfanumérico' || correspondingMapping.dataType === 'Texto')) ? correspondingMapping.length : 10;


    setOutputConfig(prev => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          mappedField: newFieldId,
          order: maxOrder + 1,
           length: prev.format === 'txt' ? (defaultLength ?? 10) : undefined, // Use mapping length or default for TXT
        }
      ].sort((a, b) => a.order - b.order) // Ensure sorted order
    }));
  };


  const removeOutputField = (index: number) => {
     setOutputConfig(prev => {
         const newFields = prev.fields.filter((_, i) => i !== index);
         // Re-assign order after removal
         const reorderedFields = newFields.sort((a, b) => a.order - b.order).map((f, idx) => ({ ...f, order: idx }));
         return {
             ...prev,
             fields: reorderedFields,
         };
     });
   };


  // Effect to initialize/update output fields based on mapped fields
   useEffect(() => {
       const mappedFieldsWithOptions = columnMappings
           .filter(m => m.mappedField !== null)
           .map((m, index) => ({
               mappedField: m.mappedField!,
               order: index, // Initial order based on input column order
               length: (m.dataType === 'Alfanumérico' || m.dataType === 'Texto') ? (m.length ?? 10) : undefined // Default length 10 for text types if not set
           }));

       // Filter out duplicates that might arise if multiple input columns map to the same output field, keeping the first occurrence's order
       const uniqueMappedFields = mappedFieldsWithOptions.reduce((acc, current) => {
           if (!acc.some(item => item.mappedField === current.mappedField)) {
               acc.push(current);
           }
           return acc;
       }, [] as OutputConfig['fields']);

       setOutputConfig(prev => {
            // Preserve existing fields' configurations (order, length) if they still exist in the unique list
            const existingFieldsMap = new Map(prev.fields.map(f => [f.mappedField, f]));
            const newFields = uniqueMappedFields.map((uniqueField, index) => {
                const existingField = existingFieldsMap.get(uniqueField.mappedField);
                if (existingField) {
                     // If field exists, keep its order and length (adjusting length if format changed)
                     return {
                         ...existingField,
                         length: prev.format === 'txt' ? (existingField.length ?? uniqueField.length ?? 10) : undefined,
                     };
                } else {
                    // If new field, use defaults from uniqueMappedFields, ensuring length is correct for format
                    return {
                        ...uniqueField,
                        order: prev.fields.length + index, // Append to end order
                        length: prev.format === 'txt' ? (uniqueField.length ?? 10) : undefined,
                    };
                }
            });

            // Remove fields from outputConfig that are no longer mapped
           const finalFields = newFields.filter(nf => uniqueMappedFields.some(uf => uf.mappedField === nf.mappedField));

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

    if (!fileData || fileData.length === 0 || columnMappings.length === 0 || outputConfig.fields.length === 0) {
        toast({ title: "Erro", description: "Dados de entrada, mapeamento ou configuração de saída incompletos.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    // Validate mappings and output config
    const requiredMappings = columnMappings.filter(m => outputConfig.fields.some(f => f.mappedField === m.mappedField));
    if (requiredMappings.some(m => m.mappedField && !m.dataType)) { // Check if mappedField exists before checking dataType
        toast({ title: "Erro", description: "Defina o 'Tipo' para todos os campos mapeados usados na saída.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
     if (outputConfig.format === 'txt' && outputConfig.fields.some(f => !f.length || f.length <= 0)) {
        toast({ title: "Erro", description: "Defina um 'Tamanho' válido (> 0) para todos os campos na saída TXT.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
     if (outputConfig.format === 'csv' && (!outputConfig.delimiter || outputConfig.delimiter.length === 0)) {
        toast({ title: "Erro", description: "Defina um 'Delimitador' para a saída CSV.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }


    try {
      let result = '';
      const sortedOutputFields = [...outputConfig.fields].sort((a, b) => a.order - b.order);

      fileData.forEach(row => {
        let line = '';
        sortedOutputFields.forEach((outputField, fieldIndex) => {
          const mapping = columnMappings.find(m => m.mappedField === outputField.mappedField);
          if (!mapping || !mapping.originalHeader) {
               console.warn(`Mapeamento não encontrado para o campo de saída: ${outputField.mappedField}`);
               // Add placeholder or skip based on requirements
               if (outputConfig.format === 'txt') {
                   line += ''.padEnd(outputField.length || 0);
               } else if (outputConfig.format === 'csv') {
                   if (fieldIndex > 0) line += outputConfig.delimiter;
                    line += ''; // Add empty value
               }
               return; // Skip this field for this row
           }

          let value = row[mapping.originalHeader] ?? ''; // Get value from original data using original header

          // Apply formatting/validation based on dataType
          value = String(value).trim(); // Ensure it's a string and trim whitespace

          switch (mapping.dataType) {
               case 'CPF':
                   value = value.replace(/\D/g, ''); // Remove non-digits
                   if (outputConfig.format === 'txt') {
                       value = value.padStart(11, '0'); // Pad CPF to 11 digits for TXT
                   }
                   break;
               case 'Inteiro':
               case 'Numérico': // Treat Numérico similar to Inteiro for digit removal
                   value = value.replace(/\D/g, ''); // Remove non-digits
                   break;
               case 'Contábil':
                   // Remove R$, points, replace comma with point, keep only numbers and decimal
                   value = value.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
                   // Convert to number to handle potential multiple decimal points or invalid chars, then format
                   let numValue = parseFloat(value);
                   if (isNaN(numValue)) {
                       value = ''; // Invalid number becomes empty
                   } else {
                       // Format for output (e.g., two decimal places, no thousands separator for TXT/CSV simplicity)
                       // For TXT, we might need specific padding later
                       value = numValue.toFixed(2).replace('.', ''); // Example: 1234.56 -> 123456
                   }
                   break;
               case 'Data':
                   // Attempt to parse and format date (e.g., to YYYYMMDD)
                   // This is basic, might need date-fns for robust parsing
                   try {
                       // Try common formats, needs more robust parsing
                       let date = new Date(value.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')); // DD/MM/YYYY -> YYYY-MM-DD
                       if (isNaN(date.getTime())) {
                           date = new Date(value); // Try direct parsing
                       }
                       if (!isNaN(date.getTime())) {
                           const year = date.getFullYear();
                           const month = String(date.getMonth() + 1).padStart(2, '0');
                           const day = String(date.getDate()).padStart(2, '0');
                           value = `${year}${month}${day}`;
                       } else {
                           value = ''; // Invalid date becomes empty
                       }
                   } catch {
                       value = ''; // Error parsing date
                   }
                   break;
               case 'Alfanumérico':
               case 'Texto':
               default:
                   // Keep value as is (trimmed string)
                   break;
          }


          if (outputConfig.format === 'txt') {
             const len = outputField.length || 0;
             // Padding logic
              if (mapping.dataType === 'Numérico' || mapping.dataType === 'Inteiro' || mapping.dataType === 'Contábil' || mapping.dataType === 'CPF' ) {
                  // Pad numbers/CPF with leading zeros
                  line += value.padStart(len, '0').substring(0, len);
              } else {
                  // Pad text/date/other with trailing spaces
                  line += value.padEnd(len, ' ').substring(0, len);
              }
          } else if (outputConfig.format === 'csv') {
            if (fieldIndex > 0) {
              line += outputConfig.delimiter;
            }
             // Basic CSV escaping (handle delimiter and quotes within value)
             const needsQuotes = value.includes(outputConfig.delimiter!) || value.includes('"') || value.includes('\n');
             if (needsQuotes) {
                value = `"${value.replace(/"/g, '""')}"`; // Enclose in quotes, double existing quotes
            }
            line += value;
          }
        });
        result += line + '\n';
      });

      setConvertedData(result.trimEnd()); // Trim only trailing newline
      setActiveTab("result"); // Move to result tab
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

        const blob = new Blob([convertedData], { type: outputConfig.format === 'txt' ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8' }); // Specify charset
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
    setOutputConfig({ format: 'txt', fields: [] }); // Reset output config properly
    setPredefinedFields(PREDEFINED_FIELDS); // Reset predefined fields to default
    setNewFieldName('');
    setConvertedData('');
    setIsProcessing(false);
    setActiveTab("upload");
    setShowPreview(false);
    // Reset file input visually
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const getSampleData = () => {
    return fileData.slice(0, 5); // Show first 5 rows as sample
  };

  // Render helper for Output Field selection
  const renderOutputFieldSelect = (currentIndex: number) => {
      const currentFieldMappedId = outputConfig.fields[currentIndex]?.mappedField;
       const availableOptions = predefinedFields
           .filter(pf =>
               // Allow current field OR fields not already used in output config (unless it's the current one being edited)
               pf.id === currentFieldMappedId || !outputConfig.fields.some((of, idx) => idx !== currentIndex && of.mappedField === pf.id)
           )
           .filter(pf =>
               // Only show fields that are actually mapped in the input
               columnMappings.some(cm => cm.mappedField === pf.id)
           );

       return (
           <Select
               value={currentFieldMappedId || NONE_VALUE_PLACEHOLDER} // Use placeholder if null
               onValueChange={(value) => handleOutputFieldChange(currentIndex, 'mappedField', value)}
               disabled={isProcessing}
           >
               <SelectTrigger className="w-full">
                   <SelectValue placeholder="Selecione o Campo" />
               </SelectTrigger>
               <SelectContent>
                   {/* Add a non-empty value placeholder item */}
                   <SelectItem value={NONE_VALUE_PLACEHOLDER} disabled>-- Selecione --</SelectItem>
                   {availableOptions.length > 0 ? (
                       availableOptions.map(field => (
                           <SelectItem key={field.id} value={field.id}>
                               {field.name}
                           </SelectItem>
                       ))
                   ) : (
                       <SelectItem value="__NO_OPTIONS__" disabled>Nenhum campo mapeado disponível</SelectItem>
                   )}
               </SelectContent>
           </Select>
       );
   };

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
              <div className="flex flex-col items-center space-y-6 p-6 border rounded-lg bg-card"> {/* Changed background */}
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
                  className="block w-full max-w-md text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer" // Style adjustments
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
                         <CardDescription>Associe as colunas do seu arquivo aos campos pré-definidos e configure seus tipos e tamanhos.</CardDescription>
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
                                                 <TableCell key={`prev-c-${rowIndex}-${colIndex}`} className="text-xs whitespace-nowrap"> {/* Smaller text, no wrap */}
                                                    {String(row[header] ?? '').substring(0, 50)} {/* Limit preview length */}
                                                    {String(row[header] ?? '').length > 50 ? '...' : ''}
                                                 </TableCell>
                                             ))}
                                         </TableRow>
                                     ))}
                                 </TableBody>
                             </Table>
                          </div>
                        )}

                        <div className="max-h-[50vh] overflow-auto">
                           <Table>
                             <TableHeader>
                               <TableRow>
                                 <TableHead className="w-1/3">Coluna Original</TableHead>
                                 <TableHead className="w-1/3">Mapear para Campo</TableHead>
                                 <TableHead className="w-1/6">Tipo</TableHead>
                                 <TableHead className="w-1/6">
                                     Tamanho
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <HelpCircle className="inline-block ml-1 h-4 w-4 text-muted-foreground cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Opcional. Define o tamanho fixo para TXT (tipos Alfanumérico/Texto).</p>
                                                 <p>Não se aplica a outros tipos ou formato CSV.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                 </TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                               {columnMappings.map((mapping, index) => (
                                 <TableRow key={index}>
                                   <TableCell className="font-medium">{mapping.originalHeader}</TableCell>
                                   <TableCell>
                                     <Select
                                       value={mapping.mappedField || NONE_VALUE_PLACEHOLDER} // Use placeholder value
                                       onValueChange={(value) => handleMappingChange(index, 'mappedField', value)}
                                        disabled={isProcessing}
                                     >
                                       <SelectTrigger>
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
                                       value={mapping.dataType || NONE_VALUE_PLACEHOLDER} // Use placeholder value
                                       onValueChange={(value) => handleMappingChange(index, 'dataType', value)}
                                       disabled={isProcessing || !mapping.mappedField} // Disable if not mapped
                                     >
                                       <SelectTrigger>
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
                                       value={mapping.length ?? ''} // Use empty string for controlled input if null/undefined
                                       onChange={(e) => handleMappingChange(index, 'length', e.target.value)}
                                       placeholder="Tamanho"
                                       className="w-full"
                                       disabled={isProcessing || !mapping.dataType || !['Alfanumérico', 'Texto'].includes(mapping.dataType)} // Only enable for specific types
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
                        <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2 bg-secondary/30"> {/* Added border/bg */}
                            {predefinedFields.map(field => (
                                <div key={field.id} className="flex items-center justify-between p-2 border-b last:border-b-0"> {/* Better spacing */}
                                    <span className="text-sm font-medium">{field.name} <span className="text-xs text-muted-foreground">({field.id})</span></span>
                                     <TooltipProvider>
                                        <Tooltip>
                                             <TooltipTrigger asChild>
                                                  <Button
                                                      variant="ghost"
                                                      size="icon"
                                                      onClick={() => removePredefinedField(field.id)}
                                                      disabled={isProcessing || ['matricula', 'cpf', 'rg', 'nome', 'email'].includes(field.id)} // Disable delete for core fields
                                                      className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:text-muted-foreground/50"
                                                      aria-label={`Remover campo ${field.name}`}
                                                  >
                                                      <Trash2 className="h-4 w-4" />
                                                  </Button>
                                             </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Remover campo "{field.name}"</p>
                                                 {['matricula', 'cpf', 'rg', 'nome', 'email'].includes(field.id) && <p>(Este campo pré-definido não pode ser removido)</p>}
                                            </TooltipContent>
                                        </Tooltip>
                                     </TooltipProvider>
                                </div>
                            ))}
                            {predefinedFields.length === 0 && <p className="text-sm text-muted-foreground text-center p-2">Nenhum campo definido.</p>}
                        </div>
                     </CardContent>
                      <CardFooter className="flex justify-end">
                         <Button onClick={() => setActiveTab("config")} disabled={isProcessing || headers.length === 0} variant="default"> {/* Use default variant */}
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
                             <CardDescription>Defina o formato (TXT ou CSV) e organize/configure os campos para o arquivo final.</CardDescription>
                         </CardHeader>
                         <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="output-format">Formato de Saída</Label>
                                <Select
                                    value={outputConfig.format}
                                    onValueChange={(value) => handleOutputFormatChange(value as OutputFormat)}
                                    disabled={isProcessing}
                                >
                                    <SelectTrigger id="output-format" className="w-full md:w-1/2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="txt">TXT Posicional (Largura Fixa)</SelectItem>
                                        <SelectItem value="csv">CSV (Delimitado)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {outputConfig.format === 'csv' && (
                                <div>
                                    <Label htmlFor="csv-delimiter">Delimitador CSV</Label>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <HelpCircle className="inline-block ml-1 h-4 w-4 text-muted-foreground cursor-help" />
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
                                        className="w-full md:w-1/4"
                                        disabled={isProcessing}
                                        maxLength={5} // Limit delimiter length
                                    />
                                </div>
                            )}

                             <div>
                                 <h3 className="text-lg font-medium mb-2">Campos de Saída (Arraste para reordenar - WIP)</h3>
                                  <p className="text-xs text-muted-foreground mb-2">A ordem definida aqui determina a ordem das colunas no arquivo final.</p>
                                 <div className="max-h-[40vh] overflow-auto border rounded-md">
                                     <Table>
                                         <TableHeader>
                                             <TableRow>
                                                  <TableHead className="w-[80px]">Ordem</TableHead>
                                                  <TableHead className="w-5/12">Campo Mapeado</TableHead>
                                                  {outputConfig.format === 'txt' && (
                                                      <TableHead className="w-3/12">
                                                          Tamanho (TXT)
                                                         <TooltipProvider>
                                                              <Tooltip>
                                                                  <TooltipTrigger asChild>
                                                                      <HelpCircle className="inline-block ml-1 h-4 w-4 text-muted-foreground cursor-help" />
                                                                  </TooltipTrigger>
                                                                  <TooltipContent>
                                                                      <p>Tamanho fixo para este campo no arquivo TXT.</p>
                                                                      <p>Obrigatório para formato TXT.</p>
                                                                  </TooltipContent>
                                                              </Tooltip>
                                                          </TooltipProvider>
                                                      </TableHead>
                                                  )}
                                                  <TableHead className="w-2/12 text-right">Ações</TableHead>
                                             </TableRow>
                                         </TableHeader>
                                         <TableBody>
                                             {outputConfig.fields.map((field, index) => (
                                                 <TableRow key={`out-${index}`}>
                                                      <TableCell>
                                                         <Input
                                                             type="number"
                                                             min="0"
                                                             value={field.order}
                                                             onChange={(e) => handleOutputFieldChange(index, 'order', e.target.value)}
                                                             className="w-16"
                                                             disabled={isProcessing}
                                                             aria-label={`Ordem do campo ${predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? index + 1}`}
                                                         />
                                                      </TableCell>
                                                     <TableCell>
                                                         {renderOutputFieldSelect(index)}
                                                     </TableCell>
                                                     {outputConfig.format === 'txt' && (
                                                         <TableCell>
                                                             <Input
                                                                 type="number"
                                                                 min="1"
                                                                 value={field.length ?? ''}
                                                                 onChange={(e) => handleOutputFieldChange(index, 'length', e.target.value)}
                                                                 placeholder="Obrigatório"
                                                                 className="w-full"
                                                                 required // Mark as required for HTML5 validation
                                                                 disabled={isProcessing}
                                                                  aria-label={`Tamanho do campo ${predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? index + 1}`}
                                                             />
                                                         </TableCell>
                                                     )}
                                                     <TableCell className="text-right">
                                                          <TooltipProvider>
                                                              <Tooltip>
                                                                  <TooltipTrigger asChild>
                                                                         <Button
                                                                             variant="ghost"
                                                                             size="icon"
                                                                             onClick={() => removeOutputField(index)}
                                                                             disabled={isProcessing}
                                                                             className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                                             aria-label={`Remover campo ${predefinedFields.find(pf => pf.id === field.mappedField)?.name ?? index + 1} da saída`}
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
                                             ))}
                                             {outputConfig.fields.length === 0 && (
                                                 <TableRow>
                                                     <TableCell colSpan={outputConfig.format === 'txt' ? 4 : 3} className="text-center text-muted-foreground py-4">
                                                         Nenhum campo adicionado à saída. Use o botão abaixo.
                                                     </TableCell>
                                                 </TableRow>
                                              )}
                                         </TableBody>
                                     </Table>
                                  </div>
                                  <Button onClick={addOutputField} variant="outline" className="mt-2" disabled={isProcessing || columnMappings.filter(m => m.mappedField !== null && !outputConfig.fields.some(of => of.mappedField === m.mappedField)).length === 0}>
                                      <Plus className="mr-2 h-4 w-4" /> Adicionar Campo à Saída
                                  </Button>
                             </div>
                         </CardContent>
                         <CardFooter className="flex justify-between">
                             <Button variant="outline" onClick={() => setActiveTab("mapping")} disabled={isProcessing}>Voltar</Button>
                             <Button onClick={convertFile} disabled={isProcessing || outputConfig.fields.length === 0} variant="default"> {/* Use default variant */}
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
                             <CardDescription>Pré-visualização do arquivo convertido ({outputConfig.format.toUpperCase()}). Verifique os dados antes de baixar.</CardDescription>
                         </CardHeader>
                         <CardContent>
                             <Textarea
                                 readOnly
                                 value={convertedData}
                                 className="w-full h-64 font-mono text-xs bg-secondary/30 border rounded-md" // Style adjustments
                                 placeholder="Resultado da conversão aparecerá aqui..."
                                 aria-label="Pré-visualização do arquivo convertido"
                             />
                         </CardContent>
                         <CardFooter className="flex flex-col sm:flex-row justify-between gap-2"> {/* Adjust layout for smaller screens */}
                             <Button variant="outline" onClick={() => setActiveTab("config")} disabled={isProcessing}>Voltar à Configuração</Button>
                            <div className="flex gap-2">
                                 <Button onClick={resetState} variant="outline" className="mr-2" disabled={isProcessing}>
                                     <Trash2 className="mr-2 h-4 w-4" /> Nova Conversão
                                 </Button>
                                 <Button onClick={downloadConvertedFile} disabled={isProcessing || !convertedData} variant="default"> {/* Use default variant */}
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

        <CardFooter className="text-center text-xs text-muted-foreground pt-4 border-t">
          © {new Date().getFullYear()} DataForge. Ferramenta de conversão de dados.
        </CardFooter>
      </Card>
    </div>
  );
}

// --- Helper Functions (Placeholder/Needs Implementation) ---

// Placeholder for a more robust PDF text extraction function.
// This would likely involve a dedicated library and potentially server-side processing.
async function extractTextFromPdf(data: ArrayBuffer): Promise<string> {
  console.warn("extractTextFromPdf is a placeholder and needs proper implementation.");
  // Example using pdf.js (requires setup)
  // const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  // pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`; // Or host it yourself
  // const loadingTask = pdfjsLib.getDocument({ data });
  // const pdf = await loadingTask.promise;
  // let text = '';
  // for (let i = 1; i <= pdf.numPages; i++) {
  //   const page = await pdf.getPage(i);
  //   const textContent = await page.getTextContent();
  //   text += textContent.items.map(item => item.str).join(' ');
  //   text += '\n'; // Add newline between pages
  // }
  // return text;
  return Promise.resolve("Texto extraído do PDF (placeholder)\nLinha 2 do PDF (placeholder)");
}
