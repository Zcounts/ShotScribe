import { platformService } from '../../services/platformService'

export function createLocalProjectAdapter() {
  return {
    type: 'local',
    saveRecentProjects(recentProjects) {
      platformService.saveRecentProjects(recentProjects)
    },
    loadRecentProjects() {
      return platformService.loadRecentProjects()
    },
    ensureBrowserProjectId() {
      return platformService.ensureBrowserProjectId()
    },
    saveBrowserProjectSnapshot(browserProjectId, payload) {
      return platformService.saveBrowserProjectSnapshot(browserProjectId, payload)
    },
    loadBrowserProjectSnapshot(browserProjectId) {
      return platformService.loadBrowserProjectSnapshot(browserProjectId)
    },
  }
}
