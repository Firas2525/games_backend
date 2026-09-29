import { Game } from './games.model.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';

export const getAllGames = async (query = {}) => {
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.isFeatured !== undefined) filter.isFeatured = query.isFeatured === 'true';

  return await Game.find(filter).sort({ createdAt: -1 });
};

export const getGameById = async (id) => {
  const game = await Game.findById(id);
  if (!game) {
    throw new ApiError('Game not found', HTTP_STATUS.NOT_FOUND);
  }
  return game;
};

export const createGame = async (gameData) => {
  return await Game.create(gameData);
};

export const updateGame = async (id, updateData) => {
  const game = await Game.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  if (!game) {
    throw new ApiError('Game not found', HTTP_STATUS.NOT_FOUND);
  }
  return game;
};

export const deleteGame = async (id) => {
  const game = await Game.findByIdAndDelete(id);
  if (!game) {
    throw new ApiError('Game not found', HTTP_STATUS.NOT_FOUND);
  }
  return game;
};

export const recordPlayGame = async (id) => {
  const game = await Game.findByIdAndUpdate(
    id,
    { $inc: { playedCount: 1 } },
    { new: true }
  );
  if (!game) {
    throw new ApiError('Game not found', HTTP_STATUS.NOT_FOUND);
  }
  return game;
};
