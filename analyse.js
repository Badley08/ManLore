/* ============================================
   MANLORE - ANALYSE.JS
   Statistics and Analytics Engine v2.0.1
   ============================================ */

class ManLoreAnalytics {
    constructor() {
        this.items = [];
        this.charts = {};
    }

    /**
     * Initialize analytics with current items
     */
    init(items) {
        this.items = items || [];
        console.log('[Analytics] Initialized with', this.items.length, 'items');
    }

    /**
     * Update analytics data
     */
    update(items) {
        this.items = items || [];
        console.log('[Analytics] Updated with', this.items.length, 'items');
    }

    /**
     * Generate complete statistics report
     */
    generateReport() {
        console.log('[Analytics] Generating comprehensive report...');
        
        return {
            overview: this.getOverviewStats(),
            byType: this.getStatsByType(),
            byStatus: this.getStatsByStatus(),
            byGenre: this.getStatsByGenre(),
            ratings: this.getRatingStats(),
            timeline: this.getTimelineStats(),
            reading: this.getReadingStats(),
            topItems: this.getTopItems(),
            insights: this.generateInsights()
        };
    }

    /**
     * Get overview statistics
     */
    getOverviewStats() {
        const total = this.items.length;
        const totalChapters = this.items.reduce((sum, item) => sum + (item.chapters || 0), 0);
        const avgRating = total > 0 
            ? this.items.reduce((sum, item) => sum + (item.rating || 0), 0) / total 
            : 0;
        const ratedItems = this.items.filter(item => item.rating > 0).length;
        
        return {
            total,
            totalChapters,
            avgRating: avgRating.toFixed(1),
            ratedItems,
            ratedPercentage: total > 0 ? ((ratedItems / total) * 100).toFixed(1) : 0
        };
    }

    /**
     * Get statistics by type
     */
    getStatsByType() {
        const stats = {};
        
        this.items.forEach(item => {
            if (!stats[item.type]) {
                stats[item.type] = {
                    count: 0,
                    chapters: 0,
                    avgRating: 0,
                    totalRating: 0,
                    ratedCount: 0
                };
            }
            
            stats[item.type].count++;
            stats[item.type].chapters += item.chapters || 0;
            
            if (item.rating > 0) {
                stats[item.type].totalRating += item.rating;
                stats[item.type].ratedCount++;
            }
        });
        
        // Calculate averages
        Object.keys(stats).forEach(type => {
            if (stats[type].ratedCount > 0) {
                stats[type].avgRating = (stats[type].totalRating / stats[type].ratedCount).toFixed(1);
            }
        });
        
        return stats;
    }

    /**
     * Get statistics by status
     */
    getStatsByStatus() {
        const stats = {};
        
        this.items.forEach(item => {
            if (!stats[item.status]) {
                stats[item.status] = {
                    count: 0,
                    percentage: 0
                };
            }
            stats[item.status].count++;
        });
        
        // Calculate percentages
        const total = this.items.length;
        Object.keys(stats).forEach(status => {
            stats[status].percentage = total > 0 
                ? ((stats[status].count / total) * 100).toFixed(1) 
                : 0;
        });
        
        return stats;
    }

    /**
     * Get statistics by genre
     */
    getStatsByGenre() {
        const stats = {};
        
        this.items.forEach(item => {
            if (item.genres && Array.isArray(item.genres)) {
                item.genres.forEach(genre => {
                    if (!stats[genre]) {
                        stats[genre] = {
                            count: 0,
                            avgRating: 0,
                            totalRating: 0,
                            ratedCount: 0
                        };
                    }
                    stats[genre].count++;
                    
                    if (item.rating > 0) {
                        stats[genre].totalRating += item.rating;
                        stats[genre].ratedCount++;
                    }
                });
            }
        });
        
        // Calculate averages and sort
        const sortedStats = {};
        Object.keys(stats)
            .sort((a, b) => stats[b].count - stats[a].count)
            .forEach(genre => {
                if (stats[genre].ratedCount > 0) {
                    stats[genre].avgRating = (stats[genre].totalRating / stats[genre].ratedCount).toFixed(1);
                }
                sortedStats[genre] = stats[genre];
            });
        
        return sortedStats;
    }

    /**
     * Get rating distribution statistics
     */
    getRatingStats() {
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const ratedItems = this.items.filter(item => item.rating > 0);
        
        ratedItems.forEach(item => {
            distribution[item.rating]++;
        });
        
        return {
            distribution,
            total: ratedItems.length,
            unrated: this.items.length - ratedItems.length,
            mostCommon: this.getMostCommonRating(distribution)
        };
    }

    /**
     * Get most common rating
     */
    getMostCommonRating(distribution) {
        let max = 0;
        let rating = 0;
        
        Object.keys(distribution).forEach(r => {
            if (distribution[r] > max) {
                max = distribution[r];
                rating = parseInt(r);
            }
        });
        
        return rating;
    }

    /**
     * Get timeline statistics
     */
    getTimelineStats() {
        const timeline = {};
        
        this.items.forEach(item => {
            if (item.createdAt) {
                const date = new Date(item.createdAt);
                const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                
                if (!timeline[month]) {
                    timeline[month] = 0;
                }
                timeline[month]++;
            }
        });
        
        return Object.keys(timeline)
            .sort()
            .reduce((obj, key) => {
                obj[key] = timeline[key];
                return obj;
            }, {});
    }

    /**
     * Get reading statistics
     */
    getReadingStats() {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const addedThisMonth = this.items.filter(item => 
            item.createdAt && new Date(item.createdAt) >= lastMonth
        ).length;
        
        const addedThisWeek = this.items.filter(item => 
            item.createdAt && new Date(item.createdAt) >= lastWeek
        ).length;
        
        const completedTotal = this.items.filter(item => 
            item.status === 'Terminé'
        ).length;
        
        const inProgressTotal = this.items.filter(item => 
            item.status === 'En cours'
        ).length;
        
        return {
            addedThisMonth,
            addedThisWeek,
            completedTotal,
            inProgressTotal,
            avgChaptersPerItem: this.items.length > 0 
                ? (this.items.reduce((sum, item) => sum + (item.chapters || 0), 0) / this.items.length).toFixed(1)
                : 0
        };
    }

    /**
     * Get top rated items
     */
    getTopItems() {
        return {
            topRated: this.items
                .filter(item => item.rating > 0)
                .sort((a, b) => b.rating - a.rating)
                .slice(0, 10),
            mostChapters: this.items
                .filter(item => item.chapters > 0)
                .sort((a, b) => b.chapters - a.chapters)
                .slice(0, 10),
            recentlyAdded: this.items
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 10)
        };
    }

    /**
     * Generate insights and recommendations
     */
    generateInsights() {
        const insights = [];
        const stats = this.getOverviewStats();
        const byStatus = this.getStatsByStatus();
        const byType = this.getStatsByType();
        
        // Collection size insight
        if (stats.total === 0) {
            insights.push({
                type: 'info',
                icon: 'fa-info-circle',
                message: 'Votre collection est vide. Commencez par ajouter vos premiers titres !'
            });
        } else if (stats.total < 10) {
            insights.push({
                type: 'info',
                icon: 'fa-seedling',
                message: `Vous avez ${stats.total} titre(s). Votre collection commence à prendre forme !`
            });
        } else if (stats.total >= 50) {
            insights.push({
                type: 'success',
                icon: 'fa-trophy',
                message: `Impressionnant ! Vous avez ${stats.total} titres dans votre collection !`
            });
        }
        
        // Rating insights
        if (stats.ratedItems === 0 && stats.total > 0) {
            insights.push({
                type: 'warning',
                icon: 'fa-star',
                message: 'Vous n\'avez noté aucun titre. Ajoutez des notes pour mieux organiser votre collection !'
            });
        } else if (parseFloat(stats.avgRating) >= 4.5) {
            insights.push({
                type: 'success',
                icon: 'fa-star',
                message: `Note moyenne excellente : ${stats.avgRating}/5 ! Vous avez bon goût !`
            });
        }
        
        // Reading progress insights
        if (byStatus['En cours'] && byStatus['En cours'].count > 5) {
            insights.push({
                type: 'info',
                icon: 'fa-book-reader',
                message: `Vous avez ${byStatus['En cours'].count} lectures en cours. Pensez à en terminer quelques-unes !`
            });
        }
        
        if (byStatus['À lire'] && byStatus['À lire'].count > 10) {
            insights.push({
                type: 'warning',
                icon: 'fa-bookmark',
                message: `Votre liste d\'attente contient ${byStatus['À lire'].count} titres. Peut-être temps d\'en commencer un ?`
            });
        }
        
        // Type diversity insight
        const typeCount = Object.keys(byType).length;
        if (typeCount === 1) {
            insights.push({
                type: 'info',
                icon: 'fa-palette',
                message: 'Vous ne lisez qu\'un seul type de contenu. Explorez d\'autres genres !'
            });
        } else if (typeCount >= 5) {
            insights.push({
                type: 'success',
                icon: 'fa-palette',
                message: `Collection diversifiée ! Vous lisez ${typeCount} types différents.`
            });
        }
        
        return insights;
    }

    /**
     * Render statistics page
     */
    renderStatsPage() {
        const container = document.getElementById('statsContainer');
        if (!container) {
            console.warn('[Analytics] Stats container not found');
            return;
        }
        
        const report = this.generateReport();
        
        container.innerHTML = `
            <!-- Insights -->
            ${this.renderInsights(report.insights)}
            
            <!-- Overview -->
            ${this.renderOverview(report.overview)}
            
            <!-- Reading Stats -->
            ${this.renderReadingStats(report.reading)}
            
            <!-- Type Distribution -->
            ${this.renderTypeStats(report.byType)}
            
            <!-- Status Distribution -->
            ${this.renderStatusStats(report.byStatus)}
            
            <!-- Genre Distribution -->
            ${this.renderGenreStats(report.byGenre)}
            
            <!-- Rating Distribution -->
            ${this.renderRatingStats(report.ratings)}
            
            <!-- Top Items -->
            ${this.renderTopItems(report.topItems)}
            
            <!-- Timeline -->
            ${this.renderTimeline(report.timeline)}
        `;
        
        console.log('[Analytics] Stats page rendered');
    }

    /**
     * Render insights section
     */
    renderInsights(insights) {
        if (!insights || insights.length === 0) return '';
        
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-lightbulb mr-2"></i>Aperçus
                </h3>
                <div class="space-y-3">
                    ${insights.map(insight => `
                        <div class="insight-card insight-${insight.type}">
                            <i class="fas ${insight.icon}"></i>
                            <span>${insight.message}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render overview section
     */
    renderOverview(overview) {
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-chart-pie mr-2"></i>Vue d'ensemble
                </h3>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div class="stat-mini">
                        <div class="stat-mini-value">${overview.total}</div>
                        <div class="stat-mini-label">Titres total</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${overview.totalChapters}</div>
                        <div class="stat-mini-label">Chapitres lus</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${overview.avgRating}</div>
                        <div class="stat-mini-label">Note moyenne</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${overview.ratedItems}</div>
                        <div class="stat-mini-label">Titres notés</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${overview.ratedPercentage}%</div>
                        <div class="stat-mini-label">Taux notation</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render reading stats section
     */
    renderReadingStats(reading) {
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-book-reader mr-2"></i>Activité de lecture
                </h3>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div class="stat-mini">
                        <div class="stat-mini-value">${reading.addedThisWeek}</div>
                        <div class="stat-mini-label">Ajoutés cette semaine</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${reading.addedThisMonth}</div>
                        <div class="stat-mini-label">Ajoutés ce mois</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${reading.completedTotal}</div>
                        <div class="stat-mini-label">Terminés</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${reading.inProgressTotal}</div>
                        <div class="stat-mini-label">En cours</div>
                    </div>
                    <div class="stat-mini">
                        <div class="stat-mini-value">${reading.avgChaptersPerItem}</div>
                        <div class="stat-mini-label">Moy. chapitres/titre</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render type statistics
     */
    renderTypeStats(byType) {
        const types = Object.keys(byType).sort((a, b) => byType[b].count - byType[a].count);
        
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-layer-group mr-2"></i>Répartition par type
                </h3>
                <div class="space-y-3">
                    ${types.map(type => {
                        const stat = byType[type];
                        const percentage = (stat.count / this.items.length * 100).toFixed(1);
                        return `
                            <div class="progress-item">
                                <div class="progress-header">
                                    <span class="font-medium">${type}</span>
                                    <span class="text-sm text-text-secondary">${stat.count} (${percentage}%)</span>
                                </div>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${percentage}%"></div>
                                </div>
                                <div class="progress-footer">
                                    <span class="text-xs"><i class="fas fa-bookmark mr-1"></i>${stat.chapters} chapitres</span>
                                    <span class="text-xs"><i class="fas fa-star mr-1"></i>${stat.avgRating}/5</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render status statistics
     */
    renderStatusStats(byStatus) {
        const statusOrder = ['En cours', 'Terminé', 'À lire', 'En pause', 'Re-lecture', 'Abandonné'];
        const statuses = statusOrder.filter(s => byStatus[s]);
        
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-tasks mr-2"></i>Répartition par statut
                </h3>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                    ${statuses.map(status => {
                        const stat = byStatus[status];
                        return `
                            <div class="stat-box">
                                <div class="stat-box-value">${stat.count}</div>
                                <div class="stat-box-label">${status}</div>
                                <div class="stat-box-percentage">${stat.percentage}%</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render genre statistics
     */
    renderGenreStats(byGenre) {
        const genres = Object.keys(byGenre).slice(0, 15);
        
        if (genres.length === 0) {
            return `
                <div class="glass-card p-6 rounded-2xl mb-6">
                    <h3 class="text-xl font-semibold mb-4">
                        <i class="fas fa-tags mr-2"></i>Genres populaires
                    </h3>
                    <p class="text-center text-text-secondary">Aucun genre défini pour le moment</p>
                </div>
            `;
        }
        
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-tags mr-2"></i>Top 15 genres
                </h3>
                <div class="flex flex-wrap gap-3">
                    ${genres.map(genre => {
                        const stat = byGenre[genre];
                        return `
                            <div class="genre-badge-large">
                                <span class="font-semibold">${genre}</span>
                                <span class="text-sm text-text-secondary">${stat.count} titres</span>
                                ${stat.avgRating > 0 ? `<span class="text-xs"><i class="fas fa-star mr-1"></i>${stat.avgRating}</span>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render rating statistics
     */
    renderRatingStats(ratings) {
        const total = ratings.total + ratings.unrated;
        
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-star mr-2"></i>Distribution des notes
                </h3>
                <div class="space-y-3">
                    ${[5, 4, 3, 2, 1].map(rating => {
                        const count = ratings.distribution[rating];
                        const percentage = total > 0 ? (count / total * 100).toFixed(1) : 0;
                        return `
                            <div class="rating-row">
                                <div class="rating-stars">
                                    ${Array(rating).fill('<i class="fas fa-star"></i>').join('')}
                                    ${Array(5-rating).fill('<i class="far fa-star"></i>').join('')}
                                </div>
                                <div class="rating-bar">
                                    <div class="rating-fill" style="width: ${percentage}%"></div>
                                </div>
                                <div class="rating-count">${count}</div>
                            </div>
                        `;
                    }).join('')}
                    ${ratings.unrated > 0 ? `
                        <div class="rating-row">
                            <div class="rating-stars text-text-secondary">Non noté</div>
                            <div class="rating-bar">
                                <div class="rating-fill bg-gray-600" style="width: ${(ratings.unrated / total * 100).toFixed(1)}%"></div>
                            </div>
                            <div class="rating-count">${ratings.unrated}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render top items
     */
    renderTopItems(topItems) {
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-trophy mr-2"></i>Top 10 mieux notés
                </h3>
                ${topItems.topRated.length > 0 ? `
                    <div class="space-y-2">
                        ${topItems.topRated.map((item, index) => `
                            <div class="top-item">
                                <span class="top-rank">#${index + 1}</span>
                                <span class="top-title">${item.title}</span>
                                <span class="top-rating">
                                    ${Array(item.rating).fill('<i class="fas fa-star"></i>').join('')}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p class="text-center text-text-secondary">Aucun titre noté</p>'}
            </div>
        `;
    }

    /**
     * Render timeline
     */
    renderTimeline(timeline) {
        const months = Object.keys(timeline);
        
        if (months.length === 0) {
            return '';
        }
        
        return `
            <div class="glass-card p-6 rounded-2xl mb-6">
                <h3 class="text-xl font-semibold mb-4">
                    <i class="fas fa-calendar-alt mr-2"></i>Timeline d'ajouts
                </h3>
                <div class="space-y-2">
                    ${months.map(month => {
                        const count = timeline[month];
                        const maxCount = Math.max(...Object.values(timeline));
                        const percentage = (count / maxCount * 100).toFixed(1);
                        return `
                            <div class="timeline-row">
                                <span class="timeline-month">${month}</span>
                                <div class="timeline-bar">
                                    <div class="timeline-fill" style="width: ${percentage}%"></div>
                                </div>
                                <span class="timeline-count">${count}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
}

// Initialize analytics instance
const analytics = new ManLoreAnalytics();

console.log('[Analytics] Module loaded successfully');
