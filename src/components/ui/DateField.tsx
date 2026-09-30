import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { dateToLocalDate, localDateToDate, type LocalDate } from '@/domain/dates';

import { SelectField } from './SelectField';

export interface DateFieldProps {
  label: string;
  value: LocalDate | null;
  /** Already formatted for display. */
  displayValue: string | null;
  placeholder: string;
  onChange: (date: LocalDate) => void;
  minimumDate?: LocalDate;
  maximumDate?: LocalDate;
  error?: string | null;
}

/** Opens the native Android date dialog. Dates are calendar days, never instants. */
export function DateField({
  label,
  value,
  displayValue,
  placeholder,
  onChange,
  minimumDate,
  maximumDate,
  error,
}: DateFieldProps) {
  const open = () => {
    DateTimePickerAndroid.open({
      value: value ? localDateToDate(value) : new Date(),
      mode: 'date',
      minimumDate: minimumDate ? localDateToDate(minimumDate) : undefined,
      maximumDate: maximumDate ? localDateToDate(maximumDate) : undefined,
      onValueChange: (_event, date) => {
        if (date) onChange(dateToLocalDate(date));
      },
    });
  };
  return (
    <SelectField
      label={label}
      value={displayValue}
      placeholder={placeholder}
      icon="calendar-outline"
      onPress={open}
      error={error}
    />
  );
}
