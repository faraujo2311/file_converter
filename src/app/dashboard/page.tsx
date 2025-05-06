"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, Settings, Users, BarChart } from 'lucide-react'; // Example icons

// NOTE: This is a placeholder dashboard page.
// It should be protected by authentication middleware in a real application.

export default function DashboardPage() {
    // Placeholder user data - replace with actual data from session/auth context
    const user = {
        name: "Usuário", // Replace with actual user name
        email: "usuario@example.com" // Replace with actual user email
    };

    return (
        <div className="container mx-auto p-4 md:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-foreground mb-2">Painel de Controle</h1>
                <p className="text-muted-foreground">Bem-vindo(a) de volta, {user.name}!</p>
                 {/* Add Logout Button - Placeholder */}
                 <Button variant="outline" size="sm" className="mt-2" onClick={() => alert('Logout (Funcionalidade Futura)')}>
                    Sair
                </Button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Card for File Conversion */}
                <Card className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5 text-accent" />
                            Conversor de Arquivos
                        </CardTitle>
                        <CardDescription>Acesse a ferramenta principal para converter seus arquivos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">Converta arquivos XLS, XLSX, ODS e PDF (em teste) para layouts TXT ou CSV personalizados.</p>
                    </CardContent>
                    <CardFooter>
                        <Link href="/" passHref>
                            <Button variant="default">
                                Acessar Conversor <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardFooter>
                </Card>

                {/* Placeholder Card 1 - e.g., User Management */}
                 <Card className="opacity-50 cursor-not-allowed">
                     <CardHeader>
                         <CardTitle className="flex items-center gap-2">
                             <Users className="h-5 w-5 text-muted-foreground" />
                             Gerenciar Usuários (Futuro)
                         </CardTitle>
                         <CardDescription>Adicionar, editar ou remover usuários (somente Admin).</CardDescription>
                     </CardHeader>
                     <CardContent>
                         <p className="text-sm text-muted-foreground mb-4">[Funcionalidade futura para gerenciamento de contas de usuário e perfis.]</p>
                     </CardContent>
                     <CardFooter>
                         <Button variant="outline" disabled>
                             Acessar Gerenciamento <ArrowRight className="ml-2 h-4 w-4" />
                         </Button>
                     </CardFooter>
                 </Card>

                {/* Placeholder Card 2 - e.g., Settings/Logs */}
                 <Card className="opacity-50 cursor-not-allowed">
                     <CardHeader>
                         <CardTitle className="flex items-center gap-2">
                             <BarChart className="h-5 w-5 text-muted-foreground" />
                             Configurações e Logs (Futuro)
                         </CardTitle>
                         <CardDescription>Ajustar configurações do sistema e visualizar logs (somente Admin/Suporte).</CardDescription>
                     </CardHeader>
                     <CardContent>
                         <p className="text-sm text-muted-foreground mb-4">[Funcionalidade futura para configurações de senha, sessão e visualização de logs.]</p>
                     </CardContent>
                     <CardFooter>
                         <Button variant="outline" disabled>
                             Acessar Configurações <ArrowRight className="ml-2 h-4 w-4" />
                         </Button>
                     </CardFooter>
                 </Card>

            </div>
        </div>
    );
}
