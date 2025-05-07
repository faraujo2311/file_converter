import type {Metadata} from 'next';
import { Inter } from 'next/font/google'; // Changed from Geist to Inter
import './globals.css';
import { Toaster } from "@/components/ui/toaster" // Import Toaster

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' }); // Use Inter

export const metadata: Metadata = {
  title: 'SCA - Sistema para conversão de arquivos v1.1.0', // Updated App Name and version
  description: 'Converta arquivos Excel ou PDF(em teste) para layouts TXT ou CSV personalizados. Seus dados não são armazenados, garantindo conformidade com a LGPD.', // Updated description with LGPD note
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Remove suppressHydrationWarning if the underlying issue is fixed
    // Added suppressHydrationWarning again as the whitespace issue persists intermittently in dev
    <html lang="pt-BR" suppressHydrationWarning> {/* Default language to Portuguese & suppress warning */}
      {/* Apply Inter font variable */}
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster /> {/* Add Toaster component here */}
      </body>
    </html>
  );
}
