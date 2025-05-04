import type {Metadata} from 'next';
import { Inter } from 'next/font/google'; // Changed from Geist to Inter
import './globals.css';
import { Toaster } from "@/components/ui/toaster" // Import Toaster

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' }); // Use Inter

export const metadata: Metadata = {
  title: 'DataForge', // Updated App Name
  description: 'Converta arquivos Excel ou PDF para layouts definidos.', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning> {/* Default language to Portuguese & suppress warning */}
      {/* Apply Inter font variable inside body or head if needed, not directly in html */}
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster component here */}
      </body>
    </html>
  );
}
