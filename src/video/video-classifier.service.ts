import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as path from "path"
import * as fs from "fs-extra"
// Using dynamic imports to avoid TypeScript issues
import type { Ollama } from "@langchain/ollama"
import type { ChatPromptTemplate } from "@langchain/core/prompts"

@Injectable()
export class VideoClassifierService {
  private readonly moviesPath: string
  private readonly seriesPath: string
  private readonly generalPath: string
  private model: any // Using any type for now

  constructor(private readonly configService: ConfigService) {
    this.moviesPath = this.configService.get<string>("MOVIES_PATH") || ""
    this.seriesPath = this.configService.get<string>("SHOWS_PATH") || ""
    this.generalPath = this.configService.get<string>("GENERAL_PATH") || ""

    // Initialize the LLM
    this.initializeLLM()
  }

  private async initializeLLM() {
    try {
      // Dynamically import the Ollama class
      const { Ollama } = await import("@langchain/ollama")
      this.model = new Ollama({
        model: "llama3.2", // You can configure this in your environment
        baseUrl: "http://localhost:11434", // Default Ollama URL
        temperature: 0.1,
      })
    } catch (error) {
      console.error("Error initializing LLM:", error)
    }
  }

  /**
   * Classifies a video file and returns the appropriate path based on Jellyfin naming conventions
   * @param fileName Original file name
   * @param caption Optional caption that might contain metadata
   */
  async classifyVideoByLLM(fileName: string, caption?: string): Promise<string> {
    // Check if we should use the classifier
    const useVideoClassifier = this.configService.get<string>("USE_VIDEO_CLASSIFIER") === "TRUE"

    if (!useVideoClassifier) {
      // If classifier is disabled, just use the general path with original filename
      return path.join(this.generalPath, fileName)
    }

    // Create a prompt template for classification
    const { ChatPromptTemplate } = await import("@langchain/core/prompts")
    const classifierPrompt = ChatPromptTemplate.fromTemplate(`
  You are a media file classifier for a media server. Your job is to analyze the given file name 
  and optional use caption to determine if it's a movie or TV show episode.

  in hebrew season is עונה or ע and episode is פ or פרק.

  File name: {fileName}
  Caption (optional): {caption}

  Please provide a JSON response in the following format:
  {{
    "mediaType": "movie" or "tvshow",
    "title": "title of the media (if its non english dont translate it)",
    "year": "Year of release (if available)",
    "season": "Season number (for TV shows only)",
    "episode": "Episode number (for TV shows only)",
    }}
  
  if the name of the media are not in english dont translate them, just return the original name.
  if its series keep only the name of the series and remove the season/episode numbers and episode name.
  If you cannot determine any field, use null for that field response only the json.
  you can use both title and caption to unsderstand season and episode.
`)

    try {
      console.log("Classifying video:", fileName, "with caption:", caption)
      // Create the messages to send to the LLM
      const messages = await classifierPrompt.invoke({
        fileName,
        caption: caption || "No caption provided",
      })

      // Get response from the LLM
      const response = await this.model.invoke(messages)
      console.log("Classifier response:", response)
      // Parse the response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error("Could not parse classifier response")
      }

      const classificationResult = JSON.parse(jsonMatch[0])
      console.log("Parsed classification result:", classificationResult)
      return ""
      // Generate appropriate path based on classification
      if (classificationResult.mediaType === "movie" && classificationResult.title) {
        // Format: Movies/Movie Title (Year)/Movie Title (Year).mp4
        const yearString = classificationResult.year ? ` (${classificationResult.year})` : ""
        const safeTitle = this.sanitizeFileName(classificationResult.title)
        const movieFolder = `${safeTitle}${yearString}`

        // Create the folder structure
        const movieFolderPath = path.join(this.moviesPath, movieFolder)
        fs.ensureDirSync(movieFolderPath)

        // Get file extension
        const fileExt = path.extname(fileName)

        // Final path with file
        return path.join(movieFolderPath, `${movieFolder}${fileExt}`)
      } else if (classificationResult.mediaType === "tvshow" && classificationResult.title) {
        // Format: Shows/Series Name (Year)/Season XX/Series Name SXXEXX.mp4
        const yearString = classificationResult.year ? ` (${classificationResult.year})` : ""
        const safeTitle = this.sanitizeFileName(classificationResult.title)
        const showFolder = `${safeTitle}${yearString}`

        // Determine season number with padding
        const seasonNum = classificationResult.season ? parseInt(classificationResult.season, 10) : 1
        const paddedSeason = seasonNum.toString().padStart(2, "0")
        const seasonFolder = `Season ${paddedSeason}`

        // Create folder structure
        const seasonFolderPath = path.join(this.seriesPath, showFolder, seasonFolder)
        fs.ensureDirSync(seasonFolderPath)

        // Determine episode format
        const episode = classificationResult.episode
          ? `E${parseInt(classificationResult.episode, 10).toString().padStart(2, "0")}`
          : ""

        // Create filename
        const fileExt = path.extname(fileName)
        const episodeFileName = `${safeTitle} S${paddedSeason}${episode}${fileExt}`

        // Final path with file
        return path.join(seasonFolderPath, episodeFileName)
      } else {
        // If classification failed or wasn't confident, use general path
        return path.join(this.generalPath, fileName)
      }
    } catch (error) {
      console.error("Error classifying video:", error)
      // Fall back to general path on error
      return path.join(this.generalPath, fileName)
    }
  }

  /**
   * Sanitizes file names by removing invalid characters
   * @param fileName File name to sanitize
   * @returns Sanitized file name
   */
  private sanitizeFileName(fileName: string): string {
    // Replace invalid file characters and common problematic characters
    return fileName
      .replace(/[/\\?%*:|"<>]/g, "")
      .replace(/[.]{2,}/g, ".")
      .trim()
  }
}
