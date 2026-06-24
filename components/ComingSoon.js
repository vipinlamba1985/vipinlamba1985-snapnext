import React from 'react';
import { Sparkles, CheckCircle2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

export function ComingSoon({ title, desc, features = [] }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 md:p-8 animate-in fade-in duration-500">
      <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 shadow-xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4 animate-bounce">
            <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
            {title} Coming Soon
          </CardTitle>
          <CardDescription className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {desc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {features && features.length > 0 && (
            <div className="space-y-3 bg-slate-50 dark:bg-slate-900/80 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Planned Features
              </p>
              <ul className="space-y-2">
                {features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Link href="/dashboard" passHref legacyBehavior>
              <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900 font-medium transition-all duration-200">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
