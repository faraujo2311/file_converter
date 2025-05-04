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
type DataType = 'Inteiro' | 'Alfanumérico' | 'Numérico' | 'Contábil' | 'Data' | 'Texto';
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

const DATA_TYPES: DataType[] = ['Inteiro', 'Alfanumérico', 'Numérico', 'Contábil', 'Data', 'Texto'];

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
          dataType: null, // Default to null
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
      (currentMapping[field] as any) = value;

      // Reset length if not Alphanumeric or Texto
      if (field === 'dataType' && value !== 'Alfanumérico' && value !== 'Texto') {
        currentMapping.length = null;
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

  // --- Predefined Fields ---
  const addPredefinedField = () => {
    if (newFieldName.trim() === '') {
      toast({ title: "Erro", description: "Nome do campo não pode ser vazio.", variant: "destructive" });
      return;
    }
    const newId = newFieldName.trim().toLowerCase().replace(/\s+/g, '_');
    if (predefinedFields.some(f => f.id === newId)) {
      toast({ title: "Erro", description: "Já existe um campo com esse ID.", variant: "destructive" });
      return;
    }
    setPredefinedFields([...predefinedFields, { id: newId, name: newFieldName.trim() }]);
    setNewFieldName('');
    toast({ title: "Sucesso", description: `Campo "${newFieldName.trim()}" adicionado.` });
  };

  const removePredefinedField = (idToRemove: string) => {
    // Prevent removing core fields if needed, or add confirmation
    const fieldToRemove = predefinedFields.find(f => f.id === idToRemove);
    if (fieldToRemove && ['matricula', 'cpf', 'rg', 'nome', 'email'].includes(idToRemove)) {
         toast({ title: "Aviso", description: `Não é possível remover o campo pré-definido "${fieldToRemove.name}".`, variant: "default" });
         return;
     }

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
      fields: value === 'csv' ? prev.fields.map(f => ({ ...f, length: undefined })) : prev.fields,
    }));
  };

  const handleDelimiterChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setOutputConfig(prev => ({ ...prev, delimiter: event.target.value }));
  };

  const handleOutputFieldChange = (index: number, field: keyof OutputConfig['fields'][0], value: any) => {
      setOutputConfig(prev => {
          const newFields = [...prev.fields];
          const currentField = { ...newFields[index] };
          (currentField[field] as any) = value;

          // Ensure length is a number or undefined
          if (field === 'length') {
            const numValue = parseInt(value, 10);
            currentField.length = isNaN(numValue) || numValue <= 0 ? undefined : numValue;
          }
          // Ensure order is a number
          if (field === 'order') {
            const numValue = parseInt(value, 10);
            currentField.order = isNaN(numValue) ? 0 : numValue; // Default to 0 if invalid
          }


          newFields[index] = currentField;

           // Re-sort fields by order after modification
           newFields.sort((a, b) => a.order - b.order);

          return { ...prev, fields: newFields };
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
    const maxOrder = outputConfig.fields.reduce((max, f) => Math.max(max, f.order), -1);

    setOutputConfig(prev => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          mappedField: availableMappedFields[0]!, // Add the first available one
          order: maxOrder + 1,
          length: prev.format === 'txt' ? 10 : undefined, // Default length for TXT
        }
      ].sort((a, b) => a.order - b.order) // Ensure sorted order
    }));
  };


  const removeOutputField = (index: number) => {
    setOutputConfig(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };


  // Effect to initialize output fields based on mapped fields
  useEffect(() => {
      const mappedFieldsWithOptions = columnMappings
          .filter(m => m.mappedField !== null)
          .map((m, index) => ({
              mappedField: m.mappedField!,
              order: index, // Initial order based on input column order
              length: m.length ?? (outputConfig.format === 'txt' ? 10 : undefined) // Use mapped length or default for TXT
          }));

        // Filter out duplicates that might arise if multiple input columns map to the same output field
       const uniqueMappedFields = mappedFieldsWithOptions.reduce((acc, current) => {
           if (!acc.some(item => item.mappedField === current.mappedField)) {
               acc.push(current);
           }
           return acc;
       }, [] as OutputConfig['fields']);

       uniqueMappedFields.sort((a, b) => a.order - b.order); // Sort by initial order

      setOutputConfig(prev => ({
          ...prev,
          // Only update if fields are currently empty, or if mappings change significantly?
          // This prevents wiping user's custom order/length on minor mapping changes.
          // Let's update based on available mapped fields, preserving existing ones if possible.
          fields: uniqueMappedFields
      }));

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
    if (requiredMappings.some(m => !m.dataType)) {
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

          // Apply basic formatting/validation based on dataType (can be expanded)
          value = String(value); // Ensure it's a string for processing

          if (mapping.dataType === 'CPF' || mapping.dataType === 'Numérico' || mapping.dataType === 'Inteiro') {
             value = value.replace(/\D/g, ''); // Remove non-digits for specific types
           }

          if (outputConfig.format === 'txt') {
             const len = outputField.length || 0;
             // Padding logic (simple example, might need refinement for numbers vs text)
              if (mapping.dataType === 'Numérico' || mapping.dataType === 'Inteiro' || mapping.dataType === 'Contábil' ) {
                  // Pad numbers with leading zeros
                  line += value.padStart(len, '0').substring(0, len);
              } else {
                  // Pad text with trailing spaces
                  line += value.padEnd(len, ' ').substring(0, len);
              }
          } else if (outputConfig.format === 'csv') {
            if (fieldIndex > 0) {
              line += outputConfig.delimiter;
            }
             // Basic CSV escaping (handle delimiter within value)
            if (value.includes(outputConfig.delimiter!)) {
                value = `"${value.replace(/"/g, '""')}"`; // Enclose in quotes, double existing quotes
            }
            line += value;
          }
        });
        result += line + '\n';
      });

      setConvertedData(result.trim());
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

        const blob = new Blob([convertedData], { type: outputConfig.format === 'txt' ? 'text/plain' : 'text/csv' });
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
    setConvertedData('');
    setIsProcessing(false);
    setActiveTab("upload");
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
               // Allow current field OR fields not already used in output config
               pf.id === currentFieldMappedId || !outputConfig.fields.some((of, idx) => idx !== currentIndex && of.mappedField === pf.id)
           )
           .filter(pf =>
               // Only show fields that are actually mapped in the input
               columnMappings.some(cm => cm.mappedField === pf.id)
           );

       return (
           <Select
               value={currentFieldMappedId || ""}
               onValueChange={(value) => handleOutputFieldChange(currentIndex, 'mappedField', value)}
               disabled={isProcessing}
           >
               <SelectTrigger className="w-full">
                   <SelectValue placeholder="Selecione o Campo" />
               </SelectTrigger>
               <SelectContent>
                   {availableOptions.length > 0 ? (
                       availableOptions.map(field => (
                           <SelectItem key={field.id} value={field.id}>
                               {field.name}
                           </SelectItem>
                       ))
                   ) : (
                       <SelectItem value="" disabled>Nenhum campo mapeado disponível</SelectItem>
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
              <div className="flex flex-col items-center space-y-6 p-6 border rounded-lg bg-secondary/30">
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
                  className="block w-full max-w-md text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-accent/10 file:text-accent hover:file:bg-accent/20 cursor-pointer"
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
                         <CardDescription>Associe as colunas do seu arquivo aos campos pré-definidos e configure seus tipos.</CardDescription>
                     </CardHeader>
                     <CardContent>
                       <div className="flex justify-end items-center mb-4">
                         <Label htmlFor="show-preview" className="mr-2 text-sm font-medium">Mostrar Pré-visualização (5 linhas)</Label>
                         <Switch id="show-preview" checked={showPreview} onCheckedChange={setShowPreview} />
                       </div>
                       {showPreview && (
                          <div className="mb-6 max-h-60 overflow-auto border rounded-md">
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
                                                 <TableCell key={`prev-c-${rowIndex}-${colIndex}`}>{String(row[header] ?? '')}</TableCell>
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
                                       value={mapping.mappedField || ""}
                                       onValueChange={(value) => handleMappingChange(index, 'mappedField', value || null)}
                                        disabled={isProcessing}
                                     >
                                       <SelectTrigger>
                                         <SelectValue placeholder="Selecione ou deixe em branco" />
                                       </SelectTrigger>
                                       <SelectContent>
                                         <SelectItem value="">-- Não Mapear --</SelectItem>
                                         {predefinedFields.map(field => (
                                           <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>
                                         ))}
                                       </SelectContent>
                                     </Select>
                                   </TableCell>
                                   <TableCell>
                                     <Select
                                       value={mapping.dataType || ""}
                                       onValueChange={(value) => handleMappingChange(index, 'dataType', value || null)}
                                       disabled={isProcessing || !mapping.mappedField} // Disable if not mapped
                                     >
                                       <SelectTrigger>
                                         <SelectValue placeholder="Tipo" />
                                       </SelectTrigger>
                                       <SelectContent>
                                         <SelectItem value="">-- Selecione --</SelectItem>
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
                                       onChange={(e) => handleMappingChange(index, 'length', e.target.value ? parseInt(e.target.value, 10) : null)}
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
                         <CardDescription>Adicione ou remova campos personalizados para o mapeamento.</CardDescription>
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
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {predefinedFields.map(field => (
                                <div key={field.id} className="flex items-center justify-between p-2 border rounded-md bg-secondary/50">
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
                            ))}
                        </div>
                     </CardContent>
                      <CardFooter className="flex justify-end">
                         <Button onClick={() => setActiveTab("config")} disabled={isProcessing || headers.length === 0} className="bg-accent hover:bg-accent/90">
                             Próximo: Configurar Saída <ArrowRight className="ml-2 h-4 w-4" />
                         </Button>
                      </CardFooter>
                  </Card>
                </div>
              )}
               {!isProcessing && headers.length === 0 && file && (
                 <p className="text-center text-muted-foreground">Nenhum cabeçalho encontrado ou arquivo ainda não processado.</p>
               )}
               {!isProcessing && !file && (
                   <p className="text-center text-muted-foreground">Faça o upload de um arquivo na aba "Upload" para começar.</p>
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
                             <CardDescription>Defina o formato (TXT ou CSV) e organize os campos para o arquivo final.</CardDescription>
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
                                                <p>Caractere(s) para separar os campos (ex: | ou ;).</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    <Input
                                        id="csv-delimiter"
                                        type="text"
                                        value={outputConfig.delimiter || ''}
                                        onChange={handleDelimiterChange}
                                        placeholder="Ex: | ou ;"
                                        className="w-full md:w-1/4"
                                        disabled={isProcessing}
                                    />
                                </div>
                            )}

                             <div>
                                 <h3 className="text-lg font-medium mb-2">Campos de Saída</h3>
                                 <div className="max-h-[40vh] overflow-auto border rounded-md">
                                     <Table>
                                         <TableHeader>
                                             <TableRow>
                                                  <TableHead className="w-1/12">Ordem</TableHead>
                                                  <TableHead className="w-5/12">Campo Mapeado</TableHead>
                                                  {outputConfig.format === 'txt' && <TableHead className="w-3/12">Tamanho (TXT)</TableHead>}
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
                                                                 disabled={isProcessing}
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
                                                     <TableCell colSpan={outputConfig.format === 'txt' ? 4 : 3} className="text-center text-muted-foreground">
                                                         Nenhum campo adicionado à saída.
                                                     </TableCell>
                                                 </TableRow>
                                              )}
                                         </TableBody>
                                     </Table>
                                  </div>
                                  <Button onClick={addOutputField} variant="outline" className="mt-2" disabled={isProcessing}>
                                      <Plus className="mr-2 h-4 w-4" /> Adicionar Campo à Saída
                                  </Button>
                             </div>
                         </CardContent>
                         <CardFooter className="flex justify-between">
                             <Button variant="outline" onClick={() => setActiveTab("mapping")} disabled={isProcessing}>Voltar</Button>
                             <Button onClick={convertFile} disabled={isProcessing || outputConfig.fields.length === 0} className="bg-accent hover:bg-accent/90">
                                 {isProcessing ? 'Convertendo...' : 'Iniciar Conversão'}
                                 {!isProcessing && <ArrowRight className="ml-2 h-4 w-4" />}
                             </Button>
                         </CardFooter>
                    </Card>
                 </div>
                )}
                 {!isProcessing && (!file || headers.length === 0) && (
                    <p className="text-center text-muted-foreground">Complete as etapas de Upload e Mapeamento primeiro.</p>
                )}
            </TabsContent>

             {/* 4. Result Tab */}
            <TabsContent value="result">
               {isProcessing && <p className="text-accent text-center animate-pulse">Gerando resultado...</p>}
                {!isProcessing && convertedData && (
                    <Card>
                         <CardHeader>
                             <CardTitle className="text-xl">Resultado da Conversão</CardTitle>
                             <CardDescription>Pré-visualização do arquivo convertido ({outputConfig.format.toUpperCase()}).</CardDescription>
                         </CardHeader>
                         <CardContent>
                             <Textarea
                                 readOnly
                                 value={convertedData}
                                 className="w-full h-64 font-mono text-xs bg-secondary/50" // Use mono font for fixed-width
                                 placeholder="Resultado da conversão aparecerá aqui..."
                             />
                         </CardContent>
                         <CardFooter className="flex justify-between">
                             <Button variant="outline" onClick={() => setActiveTab("config")} disabled={isProcessing}>Voltar</Button>
                            <div>
                                 <Button onClick={resetState} variant="outline" className="mr-2" disabled={isProcessing}>
                                     Iniciar Nova Conversão
                                 </Button>
                                 <Button onClick={downloadConvertedFile} disabled={isProcessing || !convertedData} className="bg-accent hover:bg-accent/90">
                                     Baixar Arquivo Convertido
                                 </Button>
                            </div>
                         </CardFooter>
                    </Card>
                )}
                 {!isProcessing && !convertedData && (
                    <p className="text-center text-muted-foreground">Execute a conversão na aba "Configurar Saída" para ver o resultado.</p>
                )}
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="text-center text-xs text-muted-foreground pt-4 border-t">
          © {new Date().getFullYear()} DataForge. Todos os direitos reservados.
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
