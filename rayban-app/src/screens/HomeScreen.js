/**
 * HomeScreen.js — COHUA Main Dashboard Screen
 *
 * Shows GPS status, nearby campaigns, proximity alerts,
 * and glasses connection status.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, SafeAreaView,
} from 'react-native';
import { proximityEngine } from '../services/proximity-engine';
import { campaignFetcher } from '../services/fetcher';
import { locationService } from '../services/location';
import { MetaGlassesSDK } from '../meta-sdk/glasses-bridge';
import { hexToRgb, bearingToCompass, bearing } from '../services/geo-math';

export default function HomeScreen() {
  const [status, setStatus] = useState('Initializing...');
  const [campaigns, setCampaigns] = useState([]);
  const [glassesConnected, setGlassesConnected] = useState(false);
  const [engineRunning, setEngineRunning] = useState(false);

  useEffect(() => {
    // Subscribe to updates
    const unsub1 = proximityEngine.onStatus(setStatus);
    const unsub2 = campaignFetcher.onCampaignsUpdate(setCampaigns);
    const unsub3 = MetaGlassesSDK.onConnectionChange(setGlassesConnected);

    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  const toggleEngine = useCallback(() => {
    if (engineRunning) {
      proximityEngine.stop();
      setEngineRunning(false);
    } else {
      proximityEngine.start();
      setEngineRunning(true);
    }
  }, [engineRunning]);

  const connectGlasses = useCallback(async () => {
    if (glassesConnected) {
      await MetaGlassesSDK.disconnect();
    } else {
      await MetaGlassesSDK.connect();
    }
  }, [glassesConnected]);

  const renderCampaign = ({ item }) => {
    const rgb = hexToRgb(item._neonColor);
    const colorStyle = { color: item._neonColor };
    const borderStyle = { borderLeftColor: item._neonColor };
    const isNearby = item._distanceM <= 50;

    // Direction from user
    let dirLabel = '';
    if (locationService.ready) {
      const brg = bearing(
        locationService.lat, locationService.lon,
        item.latitude, item.longitude
      );
      dirLabel = bearingToCompass(brg);
    }

    return (
      <View style={[styles.card, borderStyle, isNearby && styles.cardNearby]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardName, colorStyle]}>{item.name}</Text>
          {isNearby && (
            <View style={[styles.badge, { backgroundColor: item._neonColor }]}>
              <Text style={styles.badgeText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardType}>
          {item.asset_type?.replace('_', ' ').toUpperCase() || 'AR AD'}
        </Text>
        <Text style={styles.cardDistance}>
          {item._distanceFt} FT  ·  {dirLabel}  ·  {item.location_label || ''}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>COHUA<Text style={styles.logoDot}>.</Text></Text>
        <Text style={styles.subtitle}>SPATIAL ADVERTISING ENGINE</Text>
      </View>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      {/* Control buttons */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.btn, engineRunning ? styles.btnActive : styles.btnInactive]}
          onPress={toggleEngine}
        >
          <Text style={styles.btnText}>
            {engineRunning ? '■  STOP ENGINE' : '▶  START ENGINE'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, glassesConnected ? styles.btnGlassesOn : styles.btnGlassesOff]}
          onPress={connectGlasses}
        >
          <Text style={styles.btnText}>
            {glassesConnected ? '⊙  GLASSES ON' : '○  CONNECT GLASSES'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Campaign list */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Nearby Campaigns</Text>
        <Text style={styles.listCount}>{campaigns.length}</Text>
      </View>

      <FlatList
        data={campaigns}
        renderItem={renderCampaign}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {engineRunning ? 'Scanning for campaigns...' : 'Start engine to detect campaigns'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 6,
  },
  logoDot: {
    color: '#00f3ff',
  },
  subtitle: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 3,
    marginTop: 2,
  },
  statusBar: {
    marginHorizontal: 20,
    marginVertical: 8,
    backgroundColor: 'rgba(0, 243, 255, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 243, 255, 0.2)',
    padding: 10,
  },
  statusText: {
    color: '#00f3ff',
    fontSize: 13,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnActive: {
    backgroundColor: 'rgba(0, 243, 255, 0.15)',
    borderColor: '#00f3ff',
  },
  btnInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  btnGlassesOn: {
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    borderColor: '#00ff66',
  },
  btnGlassesOff: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  listTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  listCount: {
    color: '#00f3ff',
    fontSize: 18,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardNearby: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardType: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardDistance: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 14,
  },
});
