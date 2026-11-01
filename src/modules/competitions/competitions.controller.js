import { ApiResponse } from '../../utils/apiResponse.js';
import {
  getCompetitionData,
  setCompetitionBanner,
  deleteCompetitionBanner,
} from './competitions.service.js';

export const getCompetitions = async (req, res, next) => {
  try {
    const data = await getCompetitionData(req.user);
    return ApiResponse.success(res, data, 'Competition data fetched successfully');
  } catch (error) {
    next(error);
  }
};

export const updateCompetitionBanner = async (req, res, next) => {
  try {
    const { imageUrl, title, description } = req.body;
    const comp = await setCompetitionBanner({ imageUrl, title, description });
    return ApiResponse.success(res, comp, 'تم تحديث صورة المسابقة بنجاح');
  } catch (error) {
    next(error);
  }
};

export const removeCompetitionBanner = async (req, res, next) => {
  try {
    const comp = await deleteCompetitionBanner();
    return ApiResponse.success(res, comp, 'تم حذف المسابقة بنجاح');
  } catch (error) {
    next(error);
  }
};

