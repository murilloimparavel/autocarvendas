'use client';

import React from 'react';
import { useLocale } from '@/features/i18n/LocaleProvider'
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Car,
  CircleCheck,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomSetupSteps } from './CustomSetupSteps';
import { SectionRenderer } from './SectionRenderer';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingApi } from '../hooks/useOnboardingApi';
import { getItemsFromJsonData } from '../utils/dataUtils';
import { DEALERSHIP_TEMPLATES, SECTION_DEFINITIONS, SECTION_TYPES } from '../config/templates';

const DEALERSHIP_FIELDS = [
  { key: 'name', label: 'Dealership name', autoComplete: 'organization', required: true },
  { key: 'phone', label: 'Phone', autoComplete: 'tel', type: 'tel' },
  { key: 'addressLine1', label: 'Street address', autoComplete: 'address-line1' },
  { key: 'city', label: 'City', autoComplete: 'address-level2' },
  { key: 'state', label: 'State', autoComplete: 'address-level1' },
  { key: 'postalCode', label: 'ZIP code', autoComplete: 'postal-code' },
  { key: 'salesEmail', label: 'Sales email', autoComplete: 'email', type: 'email' },
  { key: 'hoursMonFri', label: 'Hours Mon–Fri' },
  { key: 'hoursSaturday', label: 'Hours Saturday' },
  { key: 'hoursSunday', label: 'Hours Sunday' },
] as const;

type DealershipDetails = Record<(typeof DEALERSHIP_FIELDS)[number]['key'], string>;

const EMPTY_DEALERSHIP: DealershipDetails = {
  name: '',
  phone: '',
  addressLine1: '',
  city: '',
  state: '',
  postalCode: '',
  salesEmail: '',
  hoursMonFri: '',
  hoursSaturday: '',
  hoursSunday: '',
};

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Basic and Complete setups use the merchant's own dealership details, never the sample dealership's.
function withDealershipDetails(data: any, details: DealershipDetails) {
  if (!data?.dealership) return data;
  const name = details.name.trim();
  const slug = slugify(name) || 'dealership';
  return {
    ...data,
    dealership: {
      ...data.dealership,
      ...Object.fromEntries(Object.entries(details).map(([key, value]) => [key, value.trim()])),
      name,
      shortName: name,
      groupSlug: slug,
      rooftopCode: slug.slice(0, 12).toUpperCase(),
      addressLine2: '',
      serviceEmail: details.salesEmail.trim(),
      websiteUrl: '',
      homepageTitle: name,
      homepageDescription: '',
    },
  };
}

interface OnboardingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const OnboardingDialog: React.FC<OnboardingDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const text = (en: string, br: string) => pt ? br : en
  const onboardingState = useOnboardingState();
  const {
    step,
    selectedTemplate,
    currentJsonData,
    customJsonApplied,
    progressMessage,
    loadingItems,
    completedItems,
    error,
    itemErrors,
    isLoading,
    setStep,
    setSelectedTemplate,
    setCurrentJsonData,
    setCustomJsonApplied,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setError,
    setIsLoading,
    resetOnboardingState,
  } = onboardingState;

  const [dealershipDetails, setDealershipDetails] = React.useState<DealershipDetails>(EMPTY_DEALERSHIP);
  const usesDealershipDetails = selectedTemplate !== 'custom';
  const seedJsonData = usesDealershipDetails ? withDealershipDetails(currentJsonData, dealershipDetails) : currentJsonData;

  const { runOnboarding } = useOnboardingApi({
    selectedTemplate,
    currentJsonData: seedJsonData,
    completedItems,
    setProgress,
    setItemLoading,
    setItemCompleted,
    setItemError,
    setStep,
    setError,
    setIsLoading,
    resetOnboardingState,
  });

  if (!isOpen) return null;

  const templateConfig = DEALERSHIP_TEMPLATES[selectedTemplate];
  const displayNames: Record<string, string[]> = currentJsonData
    ? Object.fromEntries(SECTION_TYPES.map((type) => [type, getItemsFromJsonData(currentJsonData, type)]))
    : templateConfig.displayNames;
  const savedCounts: Array<[number, string, string]> = [
    [displayNames.vehicles.length, pt ? 'veículo' : 'vehicle', pt ? 'veículos' : 'vehicles'],
    [displayNames.services.length, pt ? 'pacote de serviços' : 'service package', pt ? 'pacotes de serviços' : 'service packages'],
    [displayNames.parts.length, pt ? 'peça' : 'part', pt ? 'peças' : 'parts'],
    [displayNames.financeProducts.length, pt ? 'produto financeiro' : 'finance product', pt ? 'produtos financeiros' : 'finance products'],
    [displayNames.staff.length, pt ? 'função da equipe' : 'staff role', pt ? 'funções da equipe' : 'staff roles'],
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col overflow-hidden p-0 gap-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 sm:px-6 py-4 mb-0 shrink-0">
          <DialogTitle>{text('Dealership Setup', 'Configuração da loja')}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Mobile-first layout: Store Setup header and Setup Type appear first */}
          <div className="order-1 flex shrink-0 flex-col lg:order-none lg:w-80 lg:justify-between lg:border-r">
            <div className="flex-1">
              <div className="p-4 sm:p-6">
                {/* Store Setup Header - Always visible first on mobile */}
                <div className="flex items-center space-x-3">
                  <div className="inline-flex shrink-0 items-center justify-center rounded-sm bg-muted p-3">
                    <Car
                      className="size-5 text-foreground"
                      aria-hidden={true}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-medium text-foreground">
                      {text('Dealership Setup', 'Configuração da loja')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {step === 'done'
                        ? text('Your dealership is set up', 'Sua loja está configurada')
                        : text('Set up inventory, service and staff', 'Configure estoque, oficina e equipe')}
                    </p>
                  </div>
                </div>
                <Separator className="my-4" />

                {step === 'done' ? (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-2">
                      {text('Setup complete', 'Configuração concluída')}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      {pt ? `A configuração ${selectedTemplate === 'minimal' ? 'básica' : 'completa'} da loja foi salva.` : `Your ${selectedTemplate === 'minimal' ? 'basic' : 'complete'} dealership setup is saved.`}
                    </p>

                    <div className="space-y-3 text-sm">
                      {savedCounts.map(([count, singular, plural]) => (
                        <div key={plural} className="flex items-center space-x-2 text-muted-foreground">
                          <CircleCheck className="h-4 w-4 fill-muted-foreground text-background" />
                          <span className="font-medium">
                            {count} {count === 1 ? singular : plural} saved
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : !isLoading ? (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-4">
                      {text('Setup Type', 'Tipo de configuração')}
                    </h4>
                    
                    {/* Mobile: Dropdown selector */}
                    <div className="block lg:hidden">
                      <Select
                        value={selectedTemplate}
                        onValueChange={(value) => setSelectedTemplate(value as 'minimal' | 'full' | 'custom')}
                      >
                        <SelectTrigger className="w-full h-auto py-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minimal">
                            <div className="flex flex-col items-start text-left">
                              <span className="font-medium">{text('Basic Setup', 'Configuração básica')}</span>
                              <span className="text-xs text-muted-foreground">{text('A few vehicles, services and staff roles to get started', 'Cadastre alguns veículos, serviços e funções da equipe para começar')}</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="full">
                            <div className="flex flex-col items-start text-left">
                              <span className="font-medium">{text('Complete Setup', 'Configuração completa')}</span>
                              <span className="text-xs text-muted-foreground">{text('Full inventory, service, parts, financing and staff roles', 'Estoque completo, oficina, peças, financiamento e funções da equipe')}</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="custom">
                            <div className="flex flex-col items-start text-left">
                              <span className="font-medium">{text('Custom Setup', 'Configuração personalizada')}</span>
                              <span className="text-xs text-muted-foreground">{text('Use your own JSON templates', 'Use seus próprios modelos JSON')}</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Desktop: Radio Group */}
                    <div className="hidden lg:block">
                      <RadioGroup
                        value={selectedTemplate}
                        onValueChange={(value) =>
                          setSelectedTemplate(value as 'minimal' | 'full' | 'custom')
                        }
                        className="space-y-4"
                      >
                        <div
                          className={`border p-4 rounded-md transition-colors cursor-pointer ${
                            selectedTemplate === 'minimal'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:border-blue-200'
                          }`}
                          onClick={() => setSelectedTemplate('minimal')}
                        >
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 mt-[3px]">
                              <Car
                                className={`h-5 w-5 ${
                                  selectedTemplate === 'minimal'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div className="flex-1">
                              <RadioGroupItem
                                value="minimal"
                                id="minimal"
                                className="sr-only"
                              />
                              <Label
                                htmlFor="minimal"
                                className="flex-1 cursor-pointer"
                              >
                                <div className="font-medium text-base mb-1">
                                  {text('Basic Setup', 'Configuração básica')}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {text('A few vehicles, services and staff roles to get started', 'Cadastre alguns veículos, serviços e funções da equipe para começar')}
                                </div>
                              </Label>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`border p-4 rounded-md transition-colors cursor-pointer ${
                            selectedTemplate === 'full'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:border-blue-200'
                          }`}
                          onClick={() => setSelectedTemplate('full')}
                        >
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 mt-[3px]">
                              <Building2
                                className={`h-5 w-5 ${
                                  selectedTemplate === 'full'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div className="flex-1">
                              <RadioGroupItem
                                value="full"
                                id="full"
                                className="sr-only"
                              />
                              <Label
                                htmlFor="full"
                                className="flex-1 cursor-pointer"
                              >
                                <div className="font-medium text-base mb-1">
                                  {text('Complete Setup', 'Configuração completa')}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {text('Full inventory, service, parts, financing and staff roles', 'Estoque completo, oficina, peças, financiamento e funções da equipe')}
                                </div>
                              </Label>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`border p-4 rounded-md transition-colors cursor-pointer ${
                            selectedTemplate === 'custom'
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:border-blue-200'
                          }`}
                          onClick={() => setSelectedTemplate('custom')}
                        >
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 mt-[3px]">
                              <CircleCheck
                                className={`h-5 w-5 ${
                                  selectedTemplate === 'custom'
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </div>
                            <div className="flex-1">
                              <RadioGroupItem
                                value="custom"
                                id="custom"
                                className="sr-only"
                              />
                              <Label
                                htmlFor="custom"
                                className="flex-1 cursor-pointer"
                              >
                                <div className="font-medium text-base mb-1">
                                  {text('Custom Setup', 'Configuração personalizada')}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {text('Use your own JSON templates', 'Use seus próprios modelos JSON')}
                                </div>
                              </Label>
                            </div>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-medium text-foreground">
                      Creating {selectedTemplate === 'minimal' ? 'Basic' : 'Complete'} Setup
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {progressMessage}
                    </p>
                  </>
                )}
              </div>
            </div>
            {/* Desktop buttons - hidden on mobile */}
            <div className="hidden lg:flex flex-col border-t mt-auto">
              {/* Error message above buttons */}
              {error && !isLoading && step !== 'done' && (
                <Badge
                  color="rose"
                  className="rounded-none gap-3 text-sm border-b"
                >
                  <AlertCircle className="size-4 sm:size-7" />
                  <span className="text-xs sm:text-sm">
                    {error} {text('Saved records are reused when you retry.', 'Os registros já salvos serão reutilizados se você tentar novamente.')}
                  </span>
                </Badge>
              )}

              {/* Desktop Buttons */}
              <div className="flex items-center justify-between p-4">
                {step === 'done' ? (
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="w-full sm:w-auto">
                        {text('Close', 'Fechar')}
                      </Button>
                    </DialogClose>
                    <Button asChild className="w-full sm:w-auto">
                      <a href="/" target="_blank" rel="noopener noreferrer">
                        {text('View your storefront', 'Ver a vitrine da loja')}
                        <ArrowUpRight className="ml-1.5 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <DialogClose asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isLoading}
                        className="w-full sm:w-auto"
                      >
                        {text('Cancel', 'Cancelar')}
                      </Button>
                    </DialogClose>
                    {isLoading ? (
                      <Button disabled className="w-full sm:w-auto">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {text('Creating...', 'Cadastrando…')}
                      </Button>
                    ) : (
                      <Button onClick={runOnboarding} className="w-full sm:w-auto">
                        {error ? text('Retry setup', 'Tentar novamente') : text('Confirm', 'Confirmar')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="order-2 min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:order-none">
            {selectedTemplate === 'custom' && !customJsonApplied && step !== 'done' ? (
              /* Custom Setup Steps */
              <CustomSetupSteps
                currentJson={currentJsonData}
                onJsonUpdate={(newJsonData) => {
                  setCurrentJsonData(newJsonData);
                  setCustomJsonApplied(true);
                }}
                onBack={() => setCustomJsonApplied(false)}
              />
            ) : (
              /* Unified Section Renderer Component */
              <>
              {usesDealershipDetails && step === 'template' && !isLoading && (
                <fieldset className="mb-6 grid gap-3 sm:grid-cols-2">
                  <legend className="mb-3 text-sm font-medium text-foreground">{text('Dealership', 'Dados da loja')}</legend>
                  {DEALERSHIP_FIELDS.map((field) => (
                    <div key={field.key} className={field.key === 'name' || field.key === 'addressLine1' ? 'grid gap-1.5 sm:col-span-2' : 'grid gap-1.5'}>
                      <Label htmlFor={`onboarding-${field.key}`}>{text(field.label, ({
                        'Dealership name': 'Nome da loja', Phone: 'Telefone', 'Street address': 'Endereço', City: 'Cidade', State: 'Estado',
                        'ZIP code': 'CEP', 'Sales email': 'E-mail de vendas', 'Hours Mon–Fri': 'Horário de atendimento de segunda a sexta',
                        'Hours Saturday': 'Horário de atendimento aos sábados', 'Hours Sunday': 'Horário de atendimento aos domingos',
                      } as Record<string, string>)[field.label] || field.label)}</Label>
                      <Input
                        id={`onboarding-${field.key}`}
                        type={'type' in field ? field.type : 'text'}
                        autoComplete={'autoComplete' in field ? field.autoComplete : undefined}
                        required={'required' in field}
                        value={dealershipDetails[field.key]}
                        onChange={(event) => setDealershipDetails((previous) => ({ ...previous, [field.key]: event.target.value }))}
                      />
                    </div>
                  ))}
                </fieldset>
              )}
              <SectionRenderer
                sections={SECTION_DEFINITIONS}
                selectedTemplate={selectedTemplate}
                locale={locale}
                isLoading={isLoading}
                loadingItems={loadingItems}
                completedItems={completedItems}
                itemErrors={itemErrors}
                error={error}
                step={step}
                currentJsonData={seedJsonData}
              />
              </>
            )}
          </div>
        </div>

        {/* Mobile buttons - attached to bottom */}
        <div className="flex shrink-0 flex-col border-t lg:hidden">
          {/* Mobile Error message above buttons */}
          {error && !isLoading && step !== 'done' && (
            <Badge
              color="rose"
              className="rounded-none gap-3 text-sm border-b"
            >
              <AlertCircle className="size-4 sm:size-7" />
              <span className="text-xs sm:text-sm">
                {error} {text('Saved records are reused when you retry.', 'Os registros já salvos serão reutilizados se você tentar novamente.')}
              </span>
            </Badge>
          )}

          {/* Mobile Buttons */}
          <div className="flex items-center justify-between p-4">
            {step === 'done' ? (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="flex-1">
                    {text('Close', 'Fechar')}
                  </Button>
                </DialogClose>
                <Button asChild className="flex-1">
                  <a href="/" target="_blank" rel="noopener noreferrer">
                    {text('View your storefront', 'Ver a vitrine da loja')}
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isLoading}
                    className="flex-1"
                  >
                    {text('Cancel', 'Cancelar')}
                  </Button>
                </DialogClose>
                {isLoading ? (
                  <Button disabled className="flex-1">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {text('Creating...', 'Cadastrando…')}
                  </Button>
                ) : (
                  <Button onClick={runOnboarding} className="flex-1">
                    {error ? text('Retry setup', 'Tentar novamente') : text('Confirm', 'Confirmar')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingDialog;
