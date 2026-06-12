interface ValidateRegisterInputParams {
  name: string;
  email: string;
}

interface ValidateRegisterInputSuccess {
  is_valid: true;
  normalized_name: string;
  normalized_email: string;
}

interface ValidateRegisterInputFailure {
  is_valid: false;
  error: string;
}

export type ValidateRegisterInputResult =
  | ValidateRegisterInputSuccess
  | ValidateRegisterInputFailure;

// Valida nombre y correo antes de registrar un usuario local
export function validateRegisterInput(
  params: ValidateRegisterInputParams
): ValidateRegisterInputResult {
  const normalized_name = params.name.trim();
  const normalized_email = params.email.trim().toLowerCase();

  if (normalized_name.length < 2) {
    return { is_valid: false, error: 'El nombre debe tener al menos 2 caracteres.' };
  }

  if (normalized_name.length > 80) {
    return { is_valid: false, error: 'El nombre no puede superar 80 caracteres.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized_email)) {
    return { is_valid: false, error: 'Ingresa un correo electrónico válido.' };
  }

  return { is_valid: true, normalized_name, normalized_email };
}

interface ValidateLoginInputParams {
  email: string;
}

interface ValidateLoginInputSuccess {
  is_valid: true;
  normalized_email: string;
}

interface ValidateLoginInputFailure {
  is_valid: false;
  error: string;
}

export type ValidateLoginInputResult = ValidateLoginInputSuccess | ValidateLoginInputFailure;

// Normaliza y valida el correo antes de iniciar sesión
export function validateLoginInput(params: ValidateLoginInputParams): ValidateLoginInputResult {
  const normalized_email = params.email.trim().toLowerCase();

  if (!normalized_email) {
    return { is_valid: false, error: 'Ingresa tu correo electrónico.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized_email)) {
    return { is_valid: false, error: 'Ingresa un correo electrónico válido.' };
  }

  return { is_valid: true, normalized_email };
}

interface ValidateProfileNameParams {
  name: string;
}

interface ValidateProfileNameSuccess {
  is_valid: true;
  normalized_name: string;
}

interface ValidateProfileNameFailure {
  is_valid: false;
  error: string;
}

export type ValidateProfileNameResult = ValidateProfileNameSuccess | ValidateProfileNameFailure;

// Valida el nombre visible del perfil del usuario
export function validateProfileName(params: ValidateProfileNameParams): ValidateProfileNameResult {
  const normalized_name = params.name.trim();

  if (normalized_name.length < 2) {
    return { is_valid: false, error: 'El nombre debe tener al menos 2 caracteres.' };
  }

  if (normalized_name.length > 80) {
    return { is_valid: false, error: 'El nombre no puede superar 80 caracteres.' };
  }

  return { is_valid: true, normalized_name };
}

interface ValidateAmountParams {
  amount: number;
  max_amount?: number;
}

interface ValidateAmountSuccess {
  is_valid: true;
}

interface ValidateAmountFailure {
  is_valid: false;
  error: string;
}

export type ValidateAmountResult = ValidateAmountSuccess | ValidateAmountFailure;

interface ValidatePasswordParams {
  password: string;
}

interface ValidatePasswordSuccess {
  is_valid: true;
}

interface ValidatePasswordFailure {
  is_valid: false;
  error: string;
}

export type ValidatePasswordResult = ValidatePasswordSuccess | ValidatePasswordFailure;

// Valida contraseña mínima para cuentas reales
export function validatePassword(params: ValidatePasswordParams): ValidatePasswordResult {
  if (params.password.length < 6) {
    return { is_valid: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
  }

  if (params.password.length > 128) {
    return { is_valid: false, error: 'La contraseña no puede superar 128 caracteres.' };
  }

  return { is_valid: true };
}

// Valida montos monetarios positivos con tope opcional
export function validateAmount(params: ValidateAmountParams): ValidateAmountResult {
  const max_amount = params.max_amount ?? 999_999_999;

  if (Number.isNaN(params.amount) || params.amount <= 0) {
    return { is_valid: false, error: 'Ingresa un monto válido mayor a 0.' };
  }

  if (params.amount > max_amount) {
    return { is_valid: false, error: `El monto no puede superar $${max_amount.toLocaleString()}.` };
  }

  return { is_valid: true };
}
