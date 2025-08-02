import { Injectable } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as path from "path"
// Using dynamic imports to avoid TypeScript issues
import * as guessit from "guessit-exec"

@Injectable()
export class VideoClassifierService {
  private readonly moviesPath: string
  private readonly seriesPath: string
  private readonly generalPath: string
  private readonly tmdbApiKey: string
  private model: any // Using any type for now

  constructor(private readonly configService: ConfigService) {
    this.moviesPath = "/media-server/" + this.configService.get<string>("MOVIES_FOLDER") || ""
    this.seriesPath = "/media-server/" + this.configService.get<string>("SHOWS_FOLDER") || ""
    this.generalPath = "/media-server/" + this.configService.get<string>("GENERAL_FOLDER") || ""
    this.tmdbApiKey = this.configService.get<string>("TMDB_API_TOKEN") || ""
  }

  /**
   * Checks if a title is likely in English
   * Simple check based on character set (Latin characters vs non-Latin)
   */
  private isEnglishTitle(title: string): boolean {
    // Check if the title contains mostly Latin characters
    const latinCharacters = title.match(/[a-zA-Z]/g) || []
    const totalCharacters = title.replace(/\s/g, "").length

    // If more than 70% of non-space characters are Latin, consider it English
    return latinCharacters.length / totalCharacters > 0.7
  }

  /**
   * Searches TMDB for movie and returns English title
   * Implements fallback strategy by progressively removing words if no results found
   */
  private async searchTMDBMovie(title: string, year?: string): Promise<string | null> {
    try {
      // First try with the full title
      let result = await this.performTMDBMovieSearch(title, year)
      if (result) {
        return result
      }

      console.log(`No results for full movie title "${title}", trying fallback strategy...`)

      // Split title into words and try progressively shorter versions
      const words = title.trim().split(/\s+/)
      if (words.length <= 1) {
        return null // Can't reduce further
      }

      // Try removing words from the beginning
      for (let i = 1; i < words.length; i++) {
        const reducedTitle = words.slice(i).join(" ")
        console.log(`Trying movie search without first ${i} word(s): "${reducedTitle}"`)
        result = await this.performTMDBMovieSearch(reducedTitle, year)
        if (result) {
          return result
        }
      }

      // Try removing words from the end
      for (let i = words.length - 1; i > 0; i--) {
        const reducedTitle = words.slice(0, i).join(" ")
        console.log(`Trying movie search without last ${words.length - i} word(s): "${reducedTitle}"`)
        result = await this.performTMDBMovieSearch(reducedTitle, year)
        if (result) {
          return result
        }
      }

      return null
    } catch (error) {
      console.error("Error searching TMDB for movie:", error)
      return null
    }
  }

  /**
   * Performs the actual TMDB movie search API call
   */
  private async performTMDBMovieSearch(title: string, year?: string): Promise<string | null> {
    try {
      const encodedTitle = encodeURIComponent(title)
      const yearParam = year ? `&year=${year}` : ""
      const url = `https://api.themoviedb.org/3/search/movie?query=${encodedTitle}&include_adult=false&language=en-US&page=1${yearParam}`

      const options = {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${this.tmdbApiKey}`,
        },
      }

      const response = await fetch(url, options)
      const data = await response.json()

      if (data.results && data.results.length > 0) {
        return data.results[0].title
      }

      return null
    } catch (error) {
      console.error("Error in TMDB movie search API call:", error)
      return null
    }
  }

  /**
   * Searches TMDB for TV show and returns English title
   * Implements fallback strategy by progressively removing words if no results found
   */
  private async searchTMDBTVShow(title: string, year?: string): Promise<string | null> {
    try {
      // First try with the full title
      let result = await this.performTMDBTVSearch(title, year)
      if (result) {
        return result
      }

      console.log(`No results for full TV show title "${title}", trying fallback strategy...`)

      // Split title into words and try progressively shorter versions
      const words = title.trim().split(/\s+/)
      if (words.length <= 1) {
        return null // Can't reduce further
      }

      // Try removing words from the beginning
      for (let i = 1; i < words.length; i++) {
        const reducedTitle = words.slice(i).join(" ")
        console.log(`Trying TV search without first ${i} word(s): "${reducedTitle}"`)
        result = await this.performTMDBTVSearch(reducedTitle, year)
        if (result) {
          return result
        }
      }

      // Try removing words from the end
      for (let i = words.length - 1; i > 0; i--) {
        const reducedTitle = words.slice(0, i).join(" ")
        console.log(`Trying TV search without last ${words.length - i} word(s): "${reducedTitle}"`)
        result = await this.performTMDBTVSearch(reducedTitle, year)
        if (result) {
          return result
        }
      }

      return null
    } catch (error) {
      console.error("Error searching TMDB for TV show:", error)
      return null
    }
  }

  /**
   * Performs the actual TMDB TV show search API call
   */
  private async performTMDBTVSearch(title: string, year?: string): Promise<string | null> {
    try {
      const encodedTitle = encodeURIComponent(title)
      const yearParam = year ? `&first_air_date_year=${year}` : ""
      const url = `https://api.themoviedb.org/3/search/tv?query=${encodedTitle}&include_adult=false&language=en-US&page=1${yearParam}`

      const options = {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${this.tmdbApiKey}`,
        },
      }

      const response = await fetch(url, options)
      const data = await response.json()

      if (data.results && data.results.length > 0) {
        return data.results[0].name
      }

      return null
    } catch (error) {
      console.error("Error in TMDB TV search API call:", error)
      return null
    }
  }

  /**
   * Processes a filename to make it compatible with guessit parser
   * - Converts Hebrew season/episode identifiers to English
   * - Removes content after episode identifier for TV shows
   * - Handles various formatting cases
   */
  private processFilename(filename: string): string {
    // Define Hebrew terms and their English equivalents
    const hebrewToEnglish = {
      עונה: "season",
      ע: "season",
      פרק: "episode",
      פ: "episode",
      פרקים: "episodes",
      עונות: "seasons",
      עונת: "season",
    }

    // Replace Hebrew terms with English equivalents
    let processedName = filename
    Object.entries(hebrewToEnglish).forEach(([hebrew, english]) => {
      // Replace with space after (e.g., "עונה 3" -> "season 3")
      processedName = processedName.replace(new RegExp(`${hebrew}\\s+(\\d+)`, "g"), `${english} $1`)
      // Replace without space after (e.g., "ע3" -> "season3")
      processedName = processedName.replace(new RegExp(`${hebrew}(\\d+)`, "g"), `${english}$1`)
    })

    // Clean up the result (handle extra spaces, special characters)
    processedName = processedName.replace(/\s{2,}/g, " ").trim()

    // Extract only the portion before additional information for TV shows
    // Only do this if we have identified a season/episode pattern
    if (processedName.includes("season") && processedName.includes("episode")) {
      // Match up to the episode number and discard the rest
      const match = processedName.match(/(.*?episode\s*\d+)/i)
      if (match) {
        processedName = match[1].trim()
      }
    }

    return processedName
  }

  /**
   * Classifies a video file using guessit package and returns the appropriate path
   * @param fileName Original file name
   * @param caption Optional caption that might contain metadata
   */
  async classifyVideo(fileName: string): Promise<string> {
    // Check if we should use the classifier
    const useVideoClassifier = this.configService.get<string>("USE_VIDEO_CLASSIFIER") === "TRUE"

    if (!useVideoClassifier) {
      // If classifier is disabled, just use the general path with original filename
      return path.join(this.generalPath, fileName)
    }

    try {
      console.log("Classifying video with guessit:", fileName)

      // Use caption if available, otherwise use filename
      const sourceText = fileName
      const processedFilename = this.processFilename(sourceText)

      console.log(`Original: ${sourceText}`)
      console.log(`Processed: ${processedFilename}`)

      // Parse with guessit
      const data = await guessit(processedFilename)
      console.log("Guessit parsed data:", data)

      // Generate appropriate path based on classification
      if (data.type === "movie" && data.title) {
        let finalTitle = data.title

        // Check if title is not in English and try to get English title from TMDB
        if (!this.isEnglishTitle(data.title)) {
          console.log(`Title "${data.title}" appears to be non-English, searching TMDB...`)
          const englishTitle = await this.searchTMDBMovie(data.title, data.year?.toString())
          if (englishTitle) {
            console.log(`Found English title: "${englishTitle}"`)
            finalTitle = englishTitle
          } else {
            console.log(`No English title found in TMDB, using original: "${data.title}"`)
          }
        }

        // Format: Movies/Movie Title (Year)/Movie Title (Year).mp4
        const yearString = data.year ? ` (${data.year})` : ""
        const safeTitle = this.sanitizeFileName(finalTitle)
        const movieFolder = `${safeTitle}${yearString}`

        // Create the path structure (don't create directories yet)
        const movieFolderPath = path.join(this.moviesPath, movieFolder)

        // Get file extension
        const fileExt = path.extname(fileName)

        // Final path with file
        return path.join(movieFolderPath, `${movieFolder}${fileExt}`)
      } else if (data.type === "episode" && data.title) {
        let finalTitle = data.title

        // Check if title is not in English and try to get English title from TMDB
        if (!this.isEnglishTitle(data.title)) {
          console.log(`Title "${data.title}" appears to be non-English, searching TMDB...`)
          const englishTitle = await this.searchTMDBTVShow(data.title, data.year?.toString())
          if (englishTitle) {
            console.log(`Found English title: "${englishTitle}"`)
            finalTitle = englishTitle
          } else {
            console.log(`No English title found in TMDB, using original: "${data.title}"`)
          }
        }

        // Format: Shows/Series Name (Year)/Season XX/Series Name SXXEXX.mp4
        const yearString = data.year ? ` (${data.year})` : ""
        const safeTitle = this.sanitizeFileName(finalTitle)
        const showFolder = `${safeTitle}${yearString}`

        // Determine season number with padding
        const seasonNum = data.season ? parseInt(data.season.toString(), 10) : 1
        const paddedSeason = seasonNum.toString().padStart(2, "0")
        const seasonFolder = `Season ${paddedSeason}`

        // Create path structure (don't create directories yet)
        const seasonFolderPath = path.join(this.seriesPath, showFolder, seasonFolder)

        // Determine episode format
        const episode = data.episode ? `E${parseInt(data.episode.toString(), 10).toString().padStart(2, "0")}` : ""

        // Create filename
        const fileExt = path.extname(fileName)
        const episodeFileName = `${safeTitle} S${paddedSeason}${episode}${fileExt}`

        // Final path with file
        return path.join(seasonFolderPath, episodeFileName)
      } else {
        // If classification failed or wasn't confident, use general path
        console.log("Could not classify video, using general path")
        return path.join(this.generalPath, fileName)
      }
    } catch (error) {
      console.error("Error classifying video with guessit:", error)
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

  /**
   * Fetches movie or TV show details from TMDB
   * @param title Title of the movie or TV show
   * @param year Year of release (optional)
   * @returns Details of the movie or TV show from TMDB
   */
  private async fetchTmdbDetails(title: string, year?: number) {
    // Construct the search URL
    let searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${this.tmdbApiKey}&query=${encodeURIComponent(
      title
    )}`
    if (year) {
      searchUrl += `&year=${year}`
    }

    try {
      // Fetch the data from TMDB
      const response = await fetch(searchUrl)
      const data = await response.json()

      // Check if we got valid data
      if (data && data.results && data.results.length > 0) {
        // Return the first result
        return data.results[0]
      } else {
        console.log("No results found on TMDB")
        return null
      }
    } catch (error) {
      console.error("Error fetching data from TMDB:", error)
      return null
    }
  }
}
