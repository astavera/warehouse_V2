import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Edit, Loader2, MapPin, Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAccountingCatalogs, useAccountingVendorMutations } from '@/hooks/useAccountingData';
import { normalizeText, paymentTermsLabel, vendorLocationAccountRows, type AccountingVendor } from '@/lib/accounting';
import { AccountingPageHeader, EmptyState, LoadingState } from './AccountingComponents';

type VendorForm = {
  account_number_mode: 'single' | 'by_location';
  account_number: string;
  address: string;
  city: string;
  contact_name: string;
  default_payment_method_id: string;
  email: string;
  locationAccounts: Array<{
    account_number: string;
    id: string;
    store_id: string;
    store_name: string;
  }>;
  name: string;
  notes: string;
  payment_terms_days: string;
  phone: string;
  po_box: string;
  state: string;
  street: string;
  zip_code: string;
  google_formatted_address: string;
  google_place_id: string;
};

const EMPTY_VENDOR_FORM: VendorForm = {
  account_number_mode: 'single',
  account_number: '',
  address: '',
  city: '',
  contact_name: '',
  default_payment_method_id: 'none',
  email: '',
  locationAccounts: [],
  name: '',
  notes: '',
  payment_terms_days: '',
  phone: '',
  po_box: '',
  state: '',
  street: '',
  zip_code: '',
  google_formatted_address: '',
  google_place_id: '',
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function createLocalId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-places-script';
let googlePlacesScriptPromise: Promise<void> | null = null;

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GooglePlace = {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  name?: string;
  place_id?: string;
};

type GoogleGeocoderResult = GooglePlace & {
  types?: string[];
};

type GoogleAutocomplete = {
  addListener: (eventName: 'place_changed', handler: () => void) => { remove: () => void };
  getPlace: () => GooglePlace;
};

type GoogleGeocoder = {
  geocode: (
    request: { address: string; componentRestrictions?: { country: string } },
    callback: (results: GoogleGeocoderResult[] | null, status: string) => void
  ) => void;
};

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      Geocoder: new () => GoogleGeocoder;
      places?: {
        Autocomplete: new (input: HTMLInputElement, options: Record<string, unknown>) => GoogleAutocomplete;
      };
    };
  };
};

function googlePlacesAutocomplete() {
  return (window as GoogleMapsWindow).google?.maps?.places?.Autocomplete;
}

function googleGeocoder() {
  return (window as GoogleMapsWindow).google?.maps?.Geocoder;
}

function loadGooglePlacesScript() {
  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('Missing Google Maps API key'));
  }
  if (googlePlacesAutocomplete()) return Promise.resolve();
  if (googlePlacesScriptPromise) return googlePlacesScriptPromise;

  googlePlacesScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Google Places failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Places failed to load'));
    document.head.appendChild(script);
  });

  return googlePlacesScriptPromise;
}

function readRawString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function cleanPoBox(value: string) {
  return value.replace(/^p\.?\s*o\.?\s*box\s*/i, '').trim();
}

function formatPoBox(value: string) {
  const clean = cleanPoBox(value);
  return clean ? `P.O. Box ${clean}` : '';
}

function parseVendorAddress(address: string) {
  const parts = address
    .replace(/\r?\n/g, ',')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const parsed = {
    city: '',
    po_box: '',
    state: '',
    street: '',
    zip_code: '',
  };
  const consumed = new Set<number>();
  const lastIndex = parts.length - 1;
  const last = parts[lastIndex] || '';
  const cityStateZip = last.match(/^(.+?)\s+([a-z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  const stateZip = last.match(/^([a-z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (cityStateZip) {
    parsed.city = cityStateZip[1].trim();
    parsed.state = cityStateZip[2].toUpperCase();
    parsed.zip_code = cityStateZip[3];
    consumed.add(lastIndex);
  } else if (stateZip && parts[lastIndex - 1]) {
    parsed.city = parts[lastIndex - 1];
    parsed.state = stateZip[1].toUpperCase();
    parsed.zip_code = stateZip[2];
    consumed.add(lastIndex);
    consumed.add(lastIndex - 1);
  }

  parts.forEach((part, index) => {
    if (consumed.has(index)) return;
    if (/^p\.?\s*o\.?\s*box\b/i.test(part)) {
      parsed.po_box = cleanPoBox(part);
      return;
    }
    if (!parsed.street) {
      parsed.street = part;
      return;
    }
    if (!parsed.city) parsed.city = part;
  });
  return parsed;
}

function googleComponent(place: GooglePlace, type: string, name: 'long_name' | 'short_name' = 'long_name') {
  return place.address_components?.find(component => component.types.includes(type))?.[name] || '';
}

function addressFieldsFromGooglePlace(place: GooglePlace, currentPoBox = '') {
  const streetNumber = googleComponent(place, 'street_number');
  const route = googleComponent(place, 'route');
  const street = [streetNumber, route].filter(Boolean).join(' ') || place.name || '';
  const city =
    googleComponent(place, 'locality') ||
    googleComponent(place, 'postal_town') ||
    googleComponent(place, 'sublocality') ||
    googleComponent(place, 'administrative_area_level_3');
  const state = googleComponent(place, 'administrative_area_level_1', 'short_name').toUpperCase();
  const postalCode = googleComponent(place, 'postal_code');
  const postalSuffix = googleComponent(place, 'postal_code_suffix');
  const zip_code = postalSuffix ? `${postalCode}-${postalSuffix}` : postalCode;
  return {
    city,
    google_formatted_address: place.formatted_address || '',
    google_place_id: place.place_id || '',
    po_box: currentPoBox,
    state,
    street,
    zip_code,
  };
}

type GoogleSuggestedAddress = ReturnType<typeof addressFieldsFromGooglePlace>;

function vendorAddressFields(vendor: AccountingVendor) {
  const rawPayload = vendor.raw_payload && typeof vendor.raw_payload === 'object' ? vendor.raw_payload : {};
  const stored = (rawPayload as Record<string, unknown>).vendor_address_fields;
  const row = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  const parsed = parseVendorAddress(vendor.address || '');
  return {
    city: readRawString(row.city) || parsed.city,
    po_box: readRawString(row.po_box) || readRawString(row.poBox) || parsed.po_box,
    state: (readRawString(row.state) || parsed.state).toUpperCase(),
    street: readRawString(row.street) || parsed.street,
    zip_code: readRawString(row.zip_code) || readRawString(row.zip) || parsed.zip_code,
    google_formatted_address: readRawString(row.google_formatted_address),
    google_place_id: readRawString(row.google_place_id),
  };
}

function formatVendorAddress(form: Pick<VendorForm, 'city' | 'po_box' | 'state' | 'street' | 'zip_code'>) {
  const street = form.street.trim();
  const poBox = formatPoBox(form.po_box);
  const city = form.city.trim();
  const state = form.state.trim().toUpperCase();
  const zip = form.zip_code.trim();
  const cityLine = [
    city,
    [state, zip].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  return [street, poBox, cityLine].filter(Boolean).join('\n');
}

function formFromVendor(vendor: AccountingVendor): VendorForm {
  const addressFields = vendorAddressFields(vendor);
  const locationAccounts = vendorLocationAccountRows(vendor).map(row => ({
    account_number: row.account_number || '',
    id: createLocalId('vendor-location-account'),
    store_id: row.store_id || 'none',
    store_name: row.store_name || '',
  }));
  return {
    account_number_mode: locationAccounts.length ? 'by_location' : 'single',
    account_number: vendor.account_number || '',
    address: vendor.address || '',
    city: addressFields.city,
    contact_name: vendor.contact_name || '',
    default_payment_method_id: vendor.default_payment_method_id || 'none',
    email: vendor.email || '',
    locationAccounts,
    name: vendor.name,
    notes: vendor.notes || '',
    payment_terms_days: vendor.payment_terms_days == null ? '' : String(vendor.payment_terms_days),
    phone: vendor.phone || '',
    po_box: addressFields.po_box,
    state: addressFields.state,
    street: addressFields.street,
    zip_code: addressFields.zip_code,
    google_formatted_address: addressFields.google_formatted_address,
    google_place_id: addressFields.google_place_id,
  };
}

function parseTermsDays(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 365) return undefined;
  return Math.round(parsed);
}

function VendorDialog({
  form,
  mode,
  onChange,
  onClose,
  onSave,
  open,
  saving,
}: {
  form: VendorForm;
  mode: 'create' | 'edit';
  onChange: (patch: Partial<VendorForm>) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  saving: boolean;
}) {
  const { data: catalogs } = useAccountingCatalogs();
  const stores = catalogs?.stores || [];
  const streetInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef(form);
  const onChangeRef = useRef(onChange);
  const [googleStatus, setGoogleStatus] = useState<'idle' | 'loading' | 'ready' | 'verifying' | 'suggested' | 'confirmed' | 'missing-key' | 'error'>('idle');
  const [googleSuggestion, setGoogleSuggestion] = useState<GoogleSuggestedAddress | null>(null);

  useEffect(() => {
    formRef.current = form;
    onChangeRef.current = onChange;
  }, [form, onChange]);

  useEffect(() => {
    if (!open) return;
    if (!GOOGLE_MAPS_API_KEY) {
      setGoogleStatus('missing-key');
      return;
    }

    let cancelled = false;
    let listener: { remove: () => void } | undefined;
    setGoogleStatus(formRef.current.google_place_id ? 'confirmed' : 'loading');

    loadGooglePlacesScript()
      .then(() => {
        if (cancelled || !streetInputRef.current) return;
        const Autocomplete = googlePlacesAutocomplete();
        if (!Autocomplete) throw new Error('Google Places autocomplete is unavailable');
        const autocomplete = new Autocomplete(streetInputRef.current, {
          componentRestrictions: { country: 'us' },
          fields: ['address_components', 'formatted_address', 'name', 'place_id'],
          types: ['address'],
        });
        listener = autocomplete.addListener('place_changed', () => {
          const currentForm = formRef.current;
          const place = autocomplete.getPlace();
          const googleFields = addressFieldsFromGooglePlace(place, currentForm.po_box);
          const nextForm = { ...currentForm, ...googleFields };
          setGoogleSuggestion(null);
          onChangeRef.current({
            ...googleFields,
            address: formatVendorAddress(nextForm),
          });
          setGoogleStatus(googleFields.google_place_id ? 'confirmed' : 'ready');
        });
        if (!formRef.current.google_place_id) setGoogleStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setGoogleStatus('error');
      });

    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !GOOGLE_MAPS_API_KEY || form.google_place_id) return;
    const query = formatVendorAddress({
      city: form.city,
      po_box: form.po_box,
      state: form.state,
      street: form.street,
      zip_code: form.zip_code,
    }).replace(/\s+/g, ' ').trim();
    if (!form.street.trim() || (!form.city.trim() && !form.zip_code.trim()) || query.length < 8) {
      setGoogleSuggestion(null);
      setGoogleStatus('ready');
      return;
    }

    const timer = window.setTimeout(() => {
      setGoogleStatus('verifying');
      loadGooglePlacesScript()
        .then(() => {
          const Geocoder = googleGeocoder();
          if (!Geocoder) throw new Error('Google Geocoder is unavailable');
          new Geocoder().geocode(
            {
              address: query,
              componentRestrictions: { country: 'US' },
            },
            (results, status) => {
              const firstResult = results?.find(result => result.place_id && result.address_components?.length);
              if (status === 'OK' && firstResult) {
                setGoogleSuggestion(addressFieldsFromGooglePlace(firstResult, formRef.current.po_box));
                setGoogleStatus('suggested');
              } else {
                setGoogleSuggestion(null);
                setGoogleStatus('ready');
              }
            }
          );
        })
        .catch(() => {
          setGoogleSuggestion(null);
          setGoogleStatus('error');
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [form.city, form.google_place_id, form.po_box, form.state, form.street, form.zip_code, open]);

  const addLocationAccount = () => {
    const used = new Set(form.locationAccounts.map(row => row.store_id));
    const nextStore = stores.find(store => !used.has(store.id));
    onChange({
      locationAccounts: [
        ...form.locationAccounts,
        {
          account_number: '',
          id: createLocalId('vendor-location-account'),
          store_id: nextStore?.id || 'none',
          store_name: nextStore?.name || '',
        },
      ],
    });
  };
  const updateLocationAccount = (id: string, patch: Partial<VendorForm['locationAccounts'][number]>) => {
    onChange({
      locationAccounts: form.locationAccounts.map(row => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.store_id) {
          const store = stores.find(item => item.id === patch.store_id);
          next.store_name = patch.store_id === 'none' ? '' : store?.name || row.store_name;
        }
        return next;
      }),
    });
  };
  const removeLocationAccount = (id: string) => {
    onChange({ locationAccounts: form.locationAccounts.filter(row => row.id !== id) });
  };
  const updateAddress = (patch: Partial<Pick<VendorForm, 'city' | 'po_box' | 'state' | 'street' | 'zip_code'>>) => {
    setGoogleSuggestion(null);
    const nextForm = {
      ...form,
      ...patch,
      google_formatted_address: '',
      google_place_id: '',
    };
    onChange({
      ...patch,
      google_formatted_address: '',
      google_place_id: '',
      address: formatVendorAddress(nextForm),
    });
    if (GOOGLE_MAPS_API_KEY) setGoogleStatus('ready');
  };
  const useGoogleSuggestion = () => {
    if (!googleSuggestion) return;
    const nextForm = { ...form, ...googleSuggestion };
    setGoogleSuggestion(null);
    onChange({
      ...googleSuggestion,
      address: formatVendorAddress(nextForm),
    });
    setGoogleStatus(googleSuggestion.google_place_id ? 'confirmed' : 'ready');
  };
  const addressPreview = formatVendorAddress(form) || form.address.trim();
  const googleStatusLabel = form.google_place_id
    ? 'Confirmed by Google'
    : googleStatus === 'missing-key'
      ? 'Google key missing'
      : googleStatus === 'loading'
        ? 'Connecting to Google'
        : googleStatus === 'verifying'
          ? 'Checking address'
          : googleStatus === 'suggested'
            ? 'Suggested address found'
            : googleStatus === 'error'
              ? 'Google unavailable'
              : 'Type address or select suggestion';
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create vendor' : 'Edit vendor'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Vendor Name</Label>
            <Input value={form.name} onChange={event => onChange({ name: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Account number setup</Label>
            <Select
              value={form.account_number_mode}
              onValueChange={value => onChange({ account_number_mode: value as VendorForm['account_number_mode'] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">One account number</SelectItem>
                <SelectItem value="by_location">Different by store/location</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.account_number_mode === 'single' && (
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Account Number</Label>
              <Input value={form.account_number} onChange={event => onChange({ account_number: event.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Contact Name</Label>
            <Input value={form.contact_name} onChange={event => onChange({ contact_name: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone Number</Label>
            <Input value={form.phone} onChange={event => onChange({ phone: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={event => onChange({ email: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Default Payment Method</Label>
            <Select
              value={form.default_payment_method_id}
              onValueChange={value => onChange({ default_payment_method_id: value })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                {catalogs?.paymentMethods.map(method => (
                  <SelectItem key={method.id} value={method.id}>{method.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment terms</Label>
            <Input
              inputMode="numeric"
              value={form.payment_terms_days}
              onChange={event => onChange({ payment_terms_days: event.target.value })}
              placeholder="30, 60, 90"
            />
            <div className="text-xs text-muted-foreground">
              {form.payment_terms_days.trim() ? paymentTermsLabel(form.payment_terms_days) : 'Used to calculate invoice due dates.'}
            </div>
          </div>
        </div>
        {form.account_number_mode === 'by_location' && (
          <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label>Account numbers by store/location</Label>
                <p className="text-xs text-muted-foreground">
                  Use this when the same vendor has a different account number per store or warehouse.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addLocationAccount} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add location
              </Button>
            </div>
            {form.locationAccounts.length ? (
              <div className="space-y-2">
                <div className="hidden grid-cols-[minmax(160px,0.8fr)_minmax(180px,1fr)_40px] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
                  <span>Store/location</span>
                  <span>Account number</span>
                  <span />
                </div>
                {form.locationAccounts.map(row => (
                  <div key={row.id} className="grid gap-2 md:grid-cols-[minmax(160px,0.8fr)_minmax(180px,1fr)_40px] md:items-center">
                    <Select value={row.store_id} onValueChange={value => updateLocationAccount(row.id, { store_id: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No location</SelectItem>
                        {stores.map(store => (
                          <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={row.account_number}
                      onChange={event => updateLocationAccount(row.id, { account_number: event.target.value })}
                      placeholder="Account number for this location"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLocationAccount(row.id)} aria-label="Remove location account">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-white px-3 py-4 text-center text-sm text-muted-foreground">
                No location account numbers yet.
              </div>
            )}
          </div>
        )}
        <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <Label>Address</Label>
            </div>
            <Badge
              variant={form.google_place_id ? 'default' : googleStatus === 'suggested' ? 'secondary' : 'outline'}
              className="w-fit gap-1.5"
            >
              {form.google_place_id ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : googleStatus === 'loading' || googleStatus === 'verifying' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {googleStatusLabel}
            </Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.6fr)]">
            <div className="space-y-1.5">
              <Label>Street</Label>
              <Input
                autoComplete="street-address"
                ref={streetInputRef}
                value={form.street}
                onChange={event => updateAddress({ street: event.target.value })}
                placeholder="Start typing address"
              />
            </div>
            <div className="space-y-1.5">
              <Label>P.O. Box</Label>
              <Input
                autoComplete="address-line2"
                value={form.po_box}
                onChange={event => updateAddress({ po_box: event.target.value })}
                placeholder="456"
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_150px]">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input
                autoComplete="address-level2"
                value={form.city}
                onChange={event => updateAddress({ city: event.target.value })}
                placeholder="Brooklyn"
              />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input
                autoComplete="address-level1"
                maxLength={2}
                value={form.state}
                onChange={event => updateAddress({ state: event.target.value.toUpperCase() })}
                placeholder="NY"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ZIP Code</Label>
              <Input
                autoComplete="postal-code"
                inputMode="numeric"
                value={form.zip_code}
                onChange={event => updateAddress({ zip_code: event.target.value })}
                placeholder="11201"
              />
            </div>
          </div>
          {googleSuggestion && !form.google_place_id && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-1.5 font-medium text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Suggested address
                  </div>
                  <div className="mt-1 text-emerald-700">{googleSuggestion.google_formatted_address}</div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={useGoogleSuggestion} className="w-full bg-white sm:w-auto">
                  Use suggested
                </Button>
              </div>
            </div>
          )}
          {addressPreview && (
            <div className="rounded-md border bg-white px-3 py-2 text-sm text-muted-foreground">
              <div className="whitespace-pre-line">{addressPreview}</div>
              {form.google_formatted_address && (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirmed: {form.google_formatted_address}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={event => onChange({ notes: event.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !form.name.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save vendor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountingVendorsPage() {
  const { data, isLoading } = useAccountingCatalogs();
  const { createVendor, updateVendor } = useAccountingVendorMutations();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountingVendor | null>(null);
  const [form, setForm] = useState<VendorForm>(EMPTY_VENDOR_FORM);

  const paymentMethods = data?.paymentMethods || [];

  const filtered = useMemo(() => {
    const vendors = data?.vendors || [];
    const query = normalizeText(search);
    if (!query) return vendors;
    return vendors.filter(vendor =>
      normalizeText([
        vendor.name,
        vendor.account_number,
        ...vendorLocationAccountRows(vendor).map(row => `${row.store_name || ''} ${row.account_number || ''}`),
        vendor.address,
        vendor.contact_name,
        vendor.phone,
        vendor.email,
        paymentTermsLabel(vendor.payment_terms_days),
        vendor.notes,
      ].filter(Boolean).join(' ')).includes(query)
    );
  }, [data?.vendors, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_VENDOR_FORM);
    setOpen(true);
  };

  const openEdit = (vendor: AccountingVendor) => {
    setEditing(vendor);
    setForm(formFromVendor(vendor));
    setOpen(true);
  };

  const save = async () => {
    const termsDays = parseTermsDays(form.payment_terms_days);
    if (termsDays === undefined) {
      toast.error('Payment terms must be a number between 0 and 365 days');
      return;
    }
    const locationAccountRows = form.account_number_mode === 'by_location'
      ? form.locationAccounts
          .map(row => ({
            account_number: row.account_number.trim(),
            store_id: row.store_id === 'none' ? null : row.store_id,
            store_name: row.store_name || null,
          }))
          .filter(row => row.account_number || row.store_id || row.store_name)
      : [];
    const formattedAddress = formatVendorAddress(form);
    const payload = {
      account_number: form.account_number_mode === 'single' ? form.account_number || null : null,
      address: formattedAddress || form.address.trim() || null,
      contact_name: form.contact_name || null,
      default_payment_method_id: form.default_payment_method_id === 'none' ? null : form.default_payment_method_id,
      email: form.email || null,
      name: form.name,
      notes: form.notes || null,
      payment_terms_days: termsDays,
      phone: form.phone || null,
      raw_payload: {
        ...(editing?.raw_payload || {}),
        vendor_account_number_mode: form.account_number_mode,
        vendor_address_fields: {
          city: form.city.trim() || null,
          google_confirmed: Boolean(form.google_place_id),
          google_formatted_address: form.google_formatted_address || null,
          google_place_id: form.google_place_id || null,
          po_box: cleanPoBox(form.po_box) || null,
          state: form.state.trim().toUpperCase() || null,
          street: form.street.trim() || null,
          zip_code: form.zip_code.trim() || null,
        },
        vendor_location_account_rows: locationAccountRows,
      },
    };
    try {
      if (editing) {
        await updateVendor.mutateAsync({ id: editing.id, patch: payload });
        toast.success('Vendor updated');
      } else {
        await createVendor.mutateAsync(payload);
        toast.success('Vendor created');
      }
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Vendor save failed'));
    }
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Vendors"
        description="Create, edit, and search vendor profiles used by payment entry."
        actions={
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create vendor
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search vendors" className="max-w-xl" />
          {filtered.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Account #</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Default method</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(vendor => {
                  const method = paymentMethods.find(item => item.id === vendor.default_payment_method_id);
                  const locationRows = vendorLocationAccountRows(vendor);
                  return (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.name}</TableCell>
                      <TableCell>
                        {locationRows.length ? (
                          <div className="space-y-1">
                            <Badge variant="secondary">{locationRows.length} locations</Badge>
                            <div className="max-w-[260px] text-xs text-muted-foreground">
                              {locationRows.slice(0, 2).map(row => `${row.store_name || 'Location'}: ${row.account_number || '-'}`).join(' | ')}
                              {locationRows.length > 2 ? ' ...' : ''}
                            </div>
                          </div>
                        ) : (
                          vendor.account_number || '-'
                        )}
                      </TableCell>
                      <TableCell>{vendor.contact_name || '-'}</TableCell>
                      <TableCell>{vendor.phone || '-'}</TableCell>
                      <TableCell>{vendor.email || '-'}</TableCell>
                      <TableCell>
                        {method ? <Badge variant="outline">{method.name}</Badge> : '-'}
                      </TableCell>
                      <TableCell>
                        {vendor.payment_terms_days == null ? '-' : <Badge variant="secondary">{paymentTermsLabel(vendor.payment_terms_days)}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(vendor)} aria-label="Edit vendor">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No vendors match the current search." />
          )}
        </CardContent>
      </Card>

      <VendorDialog
        form={form}
        mode={editing ? 'edit' : 'create'}
        onChange={patch => setForm(current => ({ ...current, ...patch }))}
        onClose={() => setOpen(false)}
        onSave={() => void save()}
        open={open}
        saving={createVendor.isPending || updateVendor.isPending}
      />
    </div>
  );
}
