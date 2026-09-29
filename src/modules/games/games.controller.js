import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import * as gamesService from './games.service.js';

export const getGames = asyncHandler(async (req, res) => {
  const games = await gamesService.getAllGames(req.query);
  return ApiResponse.success(res, games, 'Games fetched successfully');
});

export const getGame = asyncHandler(async (req, res) => {
  const game = await gamesService.getGameById(req.params.id);
  return ApiResponse.success(res, game, 'Game fetched successfully');
});

export const createGame = asyncHandler(async (req, res) => {
  const game = await gamesService.createGame(req.body);
  return ApiResponse.created(res, game, 'Game created successfully');
});

export const updateGame = asyncHandler(async (req, res) => {
  const game = await gamesService.updateGame(req.params.id, req.body);
  return ApiResponse.success(res, game, 'Game updated successfully');
});

export const deleteGame = asyncHandler(async (req, res) => {
  await gamesService.deleteGame(req.params.id);
  return ApiResponse.success(res, null, 'Game deleted successfully');
});

export const play = asyncHandler(async (req, res) => {
  const game = await gamesService.recordPlayGame(req.params.id);
  return ApiResponse.success(res, game, 'Game play recorded');
});
