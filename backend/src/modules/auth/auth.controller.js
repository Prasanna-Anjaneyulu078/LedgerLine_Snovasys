import { authService } from './auth.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export class AuthController {
  register = asyncHandler(async (req, res) => {
    const context = {
      ipAddress: req.ip || req.connection?.remoteAddress,
    };
    const { fullName, email, password } = req.body;
    const result = await authService.register({ fullName, email, password }, context);
    res.status(201).json(ApiResponse.created(result, 'User registered successfully'));
  });

  login = asyncHandler(async (req, res) => {
    const context = {
      ipAddress: req.ip || req.connection?.remoteAddress,
    };
    const result = await authService.login(req.body, context);
    res.status(200).json(ApiResponse.success(result, 'Login successful'));
  });

  getMe = asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user.id);
    res.status(200).json(ApiResponse.success(user, 'User profile retrieved successfully'));
  });
}

export const authController = new AuthController();

