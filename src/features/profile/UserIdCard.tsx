import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';

export function UserIdCard() {
  const { t } = useTranslation('profile');
  const { session } = useAuth();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!session?.userId) return null;

  const userId = session.userId;

  const onCopy = () => {
    void navigator.clipboard.writeText(userId);
    setCopied(true);
    toast.success(t('userId.copied'));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('userId.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <code className="select-all rounded-md bg-muted px-2 py-1 font-mono text-sm">
            {userId}
          </code>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('userId.copy')}
                  onClick={onCopy}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('userId.copyUserId')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-sm text-muted-foreground">{t('userId.description')}</p>
      </CardContent>
    </Card>
  );
}
