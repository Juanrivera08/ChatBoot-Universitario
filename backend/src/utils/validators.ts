import { body, param } from 'express-validator';

export const chatValidators = [
  body('message')
    .trim()
    .notEmpty().withMessage('El mensaje no puede estar vacío')
    .isLength({ max: 2000 }).withMessage('El mensaje no puede superar 2000 caracteres'),
  body('sessionId')
    .optional()
    .isUUID().withMessage('El sessionId debe ser un UUID válido'),
];

export const documentValidators = [
  body('title')
    .trim()
    .notEmpty().withMessage('El título es requerido')
    .isLength({ max: 255 }).withMessage('El título no puede superar 255 caracteres'),
  body('category')
    .optional()
    .isIn(['reglamento', 'calendario', 'programas', 'bienestar', 'administrativo', 'faq', 'otro'])
    .withMessage('Categoría inválida'),
];

export const authValidators = [
  body('email')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
];

export const uuidParamValidator = [
  param('id')
    .isUUID().withMessage('ID inválido'),
];
