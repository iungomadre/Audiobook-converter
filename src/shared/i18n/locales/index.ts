import type { LanguageCode } from '../languages';
import { de } from './de';
import { en, type Messages } from './en';
import { es } from './es';
import { fr } from './fr';
import { hi } from './hi';
import { id } from './id';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { nl } from './nl';
import { pl } from './pl';
import { ptBR } from './pt-BR';
import { tr } from './tr';
import { uk } from './uk';
import { zhCN } from './zh-CN';

export const DICTIONARIES: Record<LanguageCode, Messages> = {
  en, pl, es, fr, de, it, 'pt-BR': ptBR, uk, nl, tr, id, hi, 'zh-CN': zhCN, ja, ko,
};
