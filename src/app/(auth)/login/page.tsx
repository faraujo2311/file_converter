"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import Link from 'next/link';

// NOTE: This is a placeholder login page.
// Full implementation including Firebase Auth, password validation,
// captcha, session management, RBAC, etc., is deferred.

export default function LoginPage() {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        // Placeholder login logic
        console.log("Attempting login with:", { email, password });
        toast({
            title: "Login (Placeholder)",
            description: "Funcionalidade de login ainda não implementada.",
            variant: "default",
        });

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));

        // In a real scenario, you would call Firebase Auth here.
        // If successful, redirect to the dashboard (e.g., /dashboard)
        // If failed, show an error toast.

         // Example success (replace with actual logic)
         if (email === "fabio" && password === "fabio@@@231012") {
             toast({ title: "Sucesso (Simulado)", description: "Login bem-sucedido! Redirecionando..." });
             // Replace with: router.push('/dashboard');
             alert('Login simulado com sucesso! Redirecionando para / (página principal por enquanto).');
              window.location.href = '/'; // Temporary redirect to main page
         } else {
            toast({
                 title: "Erro de Login (Simulado)",
                 description: "Usuário ou senha inválidos.",
                 variant: "destructive",
             });
            setIsLoading(false);
         }

        // setIsLoading(false); // Keep loading on success simulation for redirect
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <Card className="w-full max-w-sm">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl">Login</CardTitle>
                    <CardDescription>Entre com seu e-mail e senha para acessar o SCA.</CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Usuário ou E-mail</Label>
                            <Input
                                id="email"
                                type="text" // Allow username or email
                                placeholder="seu_usuario ou m@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                        <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Senha</Label>
                                <Link href="/forgot-password" // Placeholder link
                                    className="text-sm text-accent hover:underline"
                                    onClick={(e) => { e.preventDefault(); alert('Recuperação de senha (Funcionalidade Futura)')}}>
                                    Esqueceu a senha?
                                </Link>
                             </div>
                            <Input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                         {/* Placeholder for Captcha */}
                        <div className="grid gap-2">
                            <Label htmlFor="captcha">Captcha (Placeholder)</Label>
                             <div className="flex items-center justify-center h-16 bg-muted rounded-md text-muted-foreground text-sm">
                                [ Integração Captcha Pendente ]
                             </div>
                            <Input id="captcha-input" placeholder="Digite o captcha" disabled={isLoading} />
                         </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2">
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? 'Entrando...' : 'Entrar'}
                        </Button>
                         <p className="text-xs text-center text-muted-foreground">
                            Não tem uma conta?{' '}
                            <Link href="/register" // Placeholder link
                                className="text-accent hover:underline"
                                onClick={(e) => { e.preventDefault(); alert('Cadastro (Funcionalidade Futura)')}}>
                                Cadastre-se
                            </Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
